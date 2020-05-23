import * as cdk from '@aws-cdk/core';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as docdb from '@aws-cdk/aws-docdb';
import * as iam from '@aws-cdk/aws-iam';
import { ManagedPolicy } from '@aws-cdk/aws-iam';

export class MCStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    /* ======== VPC & Networking ======== */
    const vpcCidr = "10.0.0.0/21";
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
    const port = 27017;
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
    const role = new iam.Role(this, 'MC-AppServerRole', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });
    role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))
    
    const asg = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage({generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2}),
      role: role,
      desiredCapacity: 2,
      maxCapacity:4,
      minCapacity: 2,
      healthCheck: autoscaling.HealthCheck.ec2()
    });
    
    let appSG = new ec2.SecurityGroup(this, 'App-SG', {
      description: 'Allow ssh & http access to ec2 instances',
      vpc: vpc
    });
    appSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow ssh access from any ipv4 ip');
    appSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow http access from any ipv4 ip');
    asg.addSecurityGroup(appSG);
    
    const lb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true
    });
    new cdk.CfnOutput(this, 'Site', { value: 'http://' + lb.loadBalancerDnsName });

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