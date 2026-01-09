# ============================================
# VPC Module
# ============================================

variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "public_subnets" {
  type = map(string)
}

variable "private_subnets" {
  type = map(string)
}

variable "availability_zones" {
  type = list(string)
}

# ============================================
# VPC
# ============================================

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "${var.app_name}-${var.environment}-vpc"
  }
}

# ============================================
# Internet Gateway
# ============================================

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = {
    Name = "${var.app_name}-${var.environment}-igw"
  }
}

# ============================================
# Public Subnets
# ============================================

resource "aws_subnet" "public" {
  for_each = var.public_subnets
  
  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value
  availability_zone       = "ap-northeast-2${each.key}"
  map_public_ip_on_launch = true
  
  tags = {
    Name = "${var.app_name}-${var.environment}-public-${each.key}"
    Type = "public"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = {
    Name = "${var.app_name}-${var.environment}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public
  
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

# ============================================
# NAT Gateway (for Private Subnets)
# ============================================

resource "aws_eip" "nat" {
  for_each = var.public_subnets
  domain   = "vpc"
  
  tags = {
    Name = "${var.app_name}-${var.environment}-nat-eip-${each.key}"
  }
}

resource "aws_nat_gateway" "main" {
  for_each = var.public_subnets
  
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id
  
  tags = {
    Name = "${var.app_name}-${var.environment}-nat-${each.key}"
  }
  
  depends_on = [aws_internet_gateway.main]
}

# ============================================
# Private Subnets
# ============================================

resource "aws_subnet" "private" {
  for_each = var.private_subnets
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value
  availability_zone = "ap-northeast-2${each.key}"
  
  tags = {
    Name = "${var.app_name}-${var.environment}-private-${each.key}"
    Type = "private"
  }
}

resource "aws_route_table" "private" {
  for_each = var.private_subnets
  
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[each.key].id
  }
  
  tags = {
    Name = "${var.app_name}-${var.environment}-private-rt-${each.key}"
  }
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private
  
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}

# ============================================
# Outputs
# ============================================

output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = [for s in aws_subnet.public : s.id]
}

output "private_subnet_ids" {
  value = [for s in aws_subnet.private : s.id]
}

output "nat_gateway_ips" {
  value = [for eip in aws_eip.nat : eip.public_ip]
}