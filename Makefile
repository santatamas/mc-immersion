generate-ssh-key:
	ssh-keygen -t rsa -f my_rsa_key
	
ssh-key-permission:
	chmod 400 my_rsa_key

push-ssh-key:
	aws ec2-instance-connect send-ssh-public-key --region eu-west-1 --instance-id i-003bb2c6410431893 --availability-zone eu-west-1a --instance-os-user ec2-user --ssh-public-key file://my_rsa_key.pub
	
connect:
	ssh -i my_rsa_key ec2-user@34.244.204.104
	
install-ec2connect:
	pip install ec2instanceconnectcli

connect-mssh:
	mssh i-0346af1118caa45d5
	
install-nginx:
	sudo amazon-linux-extras install nginx1 \
	sudo yum install nginx \
	sudo service nginx start \
	ss -tlpn | grep :80 \
	
