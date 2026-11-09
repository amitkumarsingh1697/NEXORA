terraform {
  required_version = ">= 1.5"
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

module "vpc" {
  source = "./modules/vpc"
  cidr   = "10.0.0.0/16"
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"
  subnet_id     = module.vpc.subnet_id
}

data "aws_ami" "ubuntu" {
  most_recent = true
}

output "ip" {
  value = aws_instance.web.public_ip
}
