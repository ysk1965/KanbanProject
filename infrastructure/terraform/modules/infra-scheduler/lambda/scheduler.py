"""
BRIDGE Infrastructure Scheduler
Handles nightly shutdown/startup of EC2 (via EB ASG) and RDS to reduce costs.

KST 03:30 (UTC 18:30): Shutdown — ASG scale to 0, RDS stop (skipped when resources.stop_rds is false)
KST 08:15 (UTC 23:15): Startup  — RDS start (no-op if already up), ASG scale to 1
Every 10 min: ensure_rds — start RDS if it is stopped (e.g. startup hit InsufficientDBInstanceCapacity).
              With resources.require_eb_up, only while EB is meant to be up (ASG min > 0).
"""

import json
import logging
import os
import time

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

eb_client = boto3.client("elasticbeanstalk")
rds_client = boto3.client("rds")
autoscaling_client = boto3.client("autoscaling")
sns_client = boto3.client("sns")

SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")

# Transient StartDBInstance errors worth retrying (AZ capacity shortage etc.)
RETRYABLE_RDS_ERRORS = {"InsufficientDBInstanceCapacity", "Throttling", "ThrottlingException"}
RDS_START_ATTEMPTS = 4
RDS_START_RETRY_DELAY_SEC = 20


def handler(event, context):
    """Lambda entry point. Expects event with action + resources."""
    action = event.get("action")  # "shutdown" or "startup"
    env = event.get("environment", "unknown")
    resources = event.get("resources", {})

    logger.info("Action=%s Environment=%s Resources=%s", action, env, json.dumps(resources))

    results = {}

    if action == "shutdown":
        # Scale down EB first, then stop RDS (unless RDS is configured to stay up)
        results["eb"] = scale_eb_asg(
            resources["eb_environment_name"],
            min_size=0,
            max_size=0,
        )
        if resources.get("stop_rds", True):
            results["rds"] = stop_rds(resources["rds_instance_id"])
        else:
            results["rds"] = {"status": "kept_running"}

    elif action == "startup":
        # Start RDS first (takes longer), then scale up EB
        results["rds"] = start_rds(resources["rds_instance_id"])
        results["eb"] = scale_eb_asg(
            resources["eb_environment_name"],
            min_size=resources.get("eb_asg_min", 1),
            max_size=resources.get("eb_asg_max", 2),
        )
    elif action == "ensure_rds":
        # Periodic safety net: recover RDS that failed to start at the scheduled startup.
        results["rds"] = ensure_rds(
            resources["eb_environment_name"],
            resources["rds_instance_id"],
            require_eb_up=resources.get("require_eb_up", True),
        )
        # Notify only when we actually acted or failed — avoid spamming every 10 min
        if results["rds"].get("status") in ("noop", "skipped_eb_down"):
            logger.info("Completed: %s", json.dumps(results, default=str))
            return {"statusCode": 200, "body": json.dumps(results, default=str)}

    else:
        results["error"] = f"Unknown action: {action}"
        logger.error("Unknown action: %s", action)

    send_notification(action, env, results)

    logger.info("Completed: %s", json.dumps(results, default=str))
    return {"statusCode": 200, "body": json.dumps(results, default=str)}


# ─── RDS Operations ───


def get_rds_status(instance_id):
    """Get current RDS instance status."""
    resp = rds_client.describe_db_instances(DBInstanceIdentifier=instance_id)
    return resp["DBInstances"][0]["DBInstanceStatus"]


def stop_rds(instance_id):
    """Stop RDS instance (idempotent)."""
    try:
        status = get_rds_status(instance_id)
        if status == "stopped":
            logger.info("RDS %s already stopped", instance_id)
            return {"status": "already_stopped"}
        if status == "stopping":
            logger.info("RDS %s is already stopping", instance_id)
            return {"status": "already_stopping"}
        if status != "available":
            logger.warning("RDS %s in unexpected state: %s, skipping", instance_id, status)
            return {"status": f"skipped_state_{status}"}

        rds_client.stop_db_instance(DBInstanceIdentifier=instance_id)
        logger.info("RDS %s stopping", instance_id)
        return {"status": "stopping"}
    except Exception as e:
        logger.error("Failed to stop RDS %s: %s", instance_id, e)
        return {"status": "error", "message": str(e)}


def start_rds(instance_id):
    """Start RDS instance (idempotent), retrying transient errors like AZ capacity shortage."""
    try:
        status = get_rds_status(instance_id)
        if status == "available":
            logger.info("RDS %s already available", instance_id)
            return {"status": "already_available"}
        if status == "starting":
            logger.info("RDS %s is already starting", instance_id)
            return {"status": "already_starting"}
        if status != "stopped":
            logger.warning("RDS %s in unexpected state: %s, skipping", instance_id, status)
            return {"status": f"skipped_state_{status}"}
    except Exception as e:
        logger.error("Failed to describe RDS %s: %s", instance_id, e)
        return {"status": "error", "message": str(e)}

    last_error = None
    for attempt in range(1, RDS_START_ATTEMPTS + 1):
        try:
            rds_client.start_db_instance(DBInstanceIdentifier=instance_id)
            logger.info("RDS %s starting (attempt %d)", instance_id, attempt)
            return {"status": "starting", "attempts": attempt}
        except ClientError as e:
            last_error = e
            code = e.response.get("Error", {}).get("Code", "")
            if code not in RETRYABLE_RDS_ERRORS or attempt == RDS_START_ATTEMPTS:
                break
            logger.warning(
                "RDS %s start attempt %d/%d failed (%s), retrying in %ds",
                instance_id, attempt, RDS_START_ATTEMPTS, code, RDS_START_RETRY_DELAY_SEC,
            )
            time.sleep(RDS_START_RETRY_DELAY_SEC)
        except Exception as e:
            last_error = e
            break

    logger.error("Failed to start RDS %s: %s", instance_id, last_error)
    return {"status": "error", "message": str(last_error)}


def ensure_rds(eb_env_name, instance_id, require_eb_up=True):
    """Start RDS if it is stopped. With require_eb_up, only while EB is meant to be up (ASG min > 0)."""
    try:
        status = get_rds_status(instance_id)
        if status != "stopped":
            return {"status": "noop", "rds_state": status}

        if require_eb_up:
            asg = get_eb_asg(eb_env_name)
            if asg is None or asg["MinSize"] == 0:
                # Nightly shutdown window or intentionally scaled down — leave RDS stopped
                return {"status": "skipped_eb_down"}
    except Exception as e:
        logger.error("ensure_rds check failed for %s: %s", instance_id, e)
        return {"status": "error", "message": str(e)}

    logger.warning("RDS %s is stopped — starting (eb=%s)", instance_id, eb_env_name)
    return start_rds(instance_id)


# ─── EB ASG Operations ───


def get_eb_asg(eb_env_name):
    """Return the EB environment's ASG description, or None if not found."""
    eb_resp = eb_client.describe_environment_resources(EnvironmentName=eb_env_name)
    asg_groups = eb_resp["EnvironmentResources"]["AutoScalingGroups"]
    if not asg_groups:
        return None
    asg_resp = autoscaling_client.describe_auto_scaling_groups(
        AutoScalingGroupNames=[asg_groups[0]["Name"]]
    )
    return asg_resp["AutoScalingGroups"][0]


def scale_eb_asg(eb_env_name, min_size, max_size):
    """Scale EB environment's ASG (idempotent)."""
    try:
        eb_resp = eb_client.describe_environment_resources(EnvironmentName=eb_env_name)
        asg_groups = eb_resp["EnvironmentResources"]["AutoScalingGroups"]

        if not asg_groups:
            logger.error("No ASG found for EB environment %s", eb_env_name)
            return {"status": "error", "message": "No ASG found"}

        asg_name = asg_groups[0]["Name"]

        # Check current state
        asg_resp = autoscaling_client.describe_auto_scaling_groups(
            AutoScalingGroupNames=[asg_name]
        )
        current = asg_resp["AutoScalingGroups"][0]
        current_min = current["MinSize"]
        current_max = current["MaxSize"]

        if current_min == min_size and current_max == max_size:
            logger.info("ASG %s already at min=%d max=%d", asg_name, min_size, max_size)
            return {
                "status": "already_scaled",
                "asg": asg_name,
                "min": min_size,
                "max": max_size,
            }

        autoscaling_client.update_auto_scaling_group(
            AutoScalingGroupName=asg_name,
            MinSize=min_size,
            MaxSize=max_size,
            DesiredCapacity=min_size,
        )

        logger.info(
            "ASG %s scaled: min=%d→%d, max=%d→%d",
            asg_name,
            current_min,
            min_size,
            current_max,
            max_size,
        )
        return {
            "status": "scaled",
            "asg": asg_name,
            "min": min_size,
            "max": max_size,
        }
    except Exception as e:
        logger.error("Failed to scale ASG for %s: %s", eb_env_name, e)
        return {"status": "error", "message": str(e)}


# ─── Notifications ───


def send_notification(action, env, results):
    """Send SNS notification about the operation result."""
    if not SNS_TOPIC_ARN:
        return

    has_error = any(
        r.get("status") == "error" for r in results.values() if isinstance(r, dict)
    )
    icon = {"shutdown": "🔴", "startup": "🟢"}.get(action, "🛠️")
    status_icon = "❌" if has_error else "✅"

    subject = f"{icon} BRIDGE {env.upper()} {action.upper()} {status_icon}"

    message_lines = [
        f"Environment: {env}",
        f"Action: {action}",
        "",
    ]
    for resource, result in results.items():
        if isinstance(result, dict):
            message_lines.append(f"  {resource}: {result.get('status', 'unknown')}")
            if result.get("message"):
                message_lines.append(f"    Detail: {result['message']}")
        else:
            message_lines.append(f"  {resource}: {result}")

    try:
        sns_client.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=subject[:100],
            Message="\n".join(message_lines),
        )
    except Exception as e:
        logger.error("SNS notification failed: %s", e)
