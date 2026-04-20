"""
BRIDGE Infrastructure Scheduler
Handles nightly shutdown/startup of EC2 (via EB ASG) and RDS to reduce costs.

KST 23:00 (UTC 14:00): Shutdown — ASG scale to 0, RDS stop
KST 08:00 (UTC 23:00): Startup  — RDS start, ASG scale to 1
"""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

eb_client = boto3.client("elasticbeanstalk")
rds_client = boto3.client("rds")
autoscaling_client = boto3.client("autoscaling")
sns_client = boto3.client("sns")

SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")


def handler(event, context):
    """Lambda entry point. Expects event with action + resources."""
    action = event.get("action")  # "shutdown" or "startup"
    env = event.get("environment", "unknown")
    resources = event.get("resources", {})

    logger.info("Action=%s Environment=%s Resources=%s", action, env, json.dumps(resources))

    results = {}

    if action == "shutdown":
        # Scale down EB first, then stop RDS
        results["eb"] = scale_eb_asg(
            resources["eb_environment_name"],
            min_size=0,
            max_size=0,
        )
        results["rds"] = stop_rds(resources["rds_instance_id"])

    elif action == "startup":
        # Start RDS first (takes longer), then scale up EB
        results["rds"] = start_rds(resources["rds_instance_id"])
        results["eb"] = scale_eb_asg(
            resources["eb_environment_name"],
            min_size=resources.get("eb_asg_min", 1),
            max_size=resources.get("eb_asg_max", 2),
        )
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
    """Start RDS instance (idempotent)."""
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

        rds_client.start_db_instance(DBInstanceIdentifier=instance_id)
        logger.info("RDS %s starting", instance_id)
        return {"status": "starting"}
    except Exception as e:
        logger.error("Failed to start RDS %s: %s", instance_id, e)
        return {"status": "error", "message": str(e)}


# ─── EB ASG Operations ───


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
    icon = "🔴" if action == "shutdown" else "🟢"
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
