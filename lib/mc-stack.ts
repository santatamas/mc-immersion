import * as cdk from '@aws-cdk/core';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as docdb from '@aws-cdk/aws-docdb';

export class MCStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    /* ======== CFN stack parameters ======== */
    const port = 27017;
    const vpcCidr = "10.0.0.0/21";
    
    
    /* ======== VPC & Networking ======== */
    const vpc = new ec2.Vpc(this, "mc-vpc", {
            cidr: vpcCidr,
            maxAzs: 2,
            subnetConfiguration: [
                {
                    subnetType: ec2.SubnetType.PRIVATE,
                    cidrMask: 28,
                    name: "Database"
                },
                {
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                    name: "Application"
                }
            ]
        });
        
    /* ======== DocumentDB cluster ======== */
    const sg = new ec2.SecurityGroup(this, "docdb-sg", {
        vpc,
        securityGroupName: "docdb-sg",
        allowAllOutbound: true
    });
    
    const subnetGroup = new docdb.CfnDBSubnetGroup(this, "subnet-group", {
            subnetIds: vpc.privateSubnets.map(x=>x.subnetId),
            dbSubnetGroupName: "subnet-group",
            dbSubnetGroupDescription: "Subnet Group for DocDB"
     });
        
    const dbCluster = new docdb.CfnDBCluster(this, "db-cluster", {
            storageEncrypted: true,
            availabilityZones: vpc.availabilityZones.splice(2),
            dbClusterIdentifier: "docdb",
            masterUsername: "dbuser",
            masterUserPassword: "password",
            vpcSecurityGroupIds: [sg.securityGroupName],
            dbSubnetGroupName: subnetGroup.dbSubnetGroupName,
            port
    });
    dbCluster.addDependsOn(subnetGroup)

    const dbInstance = new docdb.CfnDBInstance(this, "db-instance", {
            dbClusterIdentifier: dbCluster.ref,
            autoMinorVersionUpgrade: true,
            dbInstanceClass: "db.r4.large",
            dbInstanceIdentifier: "prod"
    });
    dbInstance.addDependsOn(dbCluster);

    sg.addIngressRule(ec2.Peer.ipv4(vpcCidr), ec2.Port.tcp(port));
    
    /* ======== Austoscaling EC2 & ALB ======== */
    const asg = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage(),
      desiredCapacity: 2,
      maxCapacity:4,
      minCapacity: 2,
      healthCheck: autoscaling.HealthCheck.ec2()
    });
    

     
    const lb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true
    });

    const listener = lb.addListener('Listener', {
      port: 80,
    });

    listener.addTargets('Target', {
      port: 80,
      targets: [asg]
    });

    listener.connections.allowDefaultPortFromAnyIpv4('Open to the world');
    
    asg.scaleOnRequestCount('AModestLoad', {
      targetRequestsPerSecond: 1
    });
  }
}
