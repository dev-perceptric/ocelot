#!/bin/bash
# Sets up the new OVH server (SYS-1, Ubuntu 26.04) to take over every app from the Hostinger VPS.
# Run once, as the ubuntu user, right after the OS install:
#
#   curl -fsSL https://raw.githubusercontent.com/dev-perceptric/ocelot/main/deploy/ovh/setup.sh -o setup.sh
#   sudo bash setup.sh
#
# Safe to run again. What it does:
#   - updates Ubuntu, sets the hostname (srv1) and the clock (UTC)
#   - SSH: keys only, no passwords; root can log in with the same key as ubuntu (the move script needs it)
#   - firewall: only SSH (22), web (80, 443) and HTTP/3 (443 udp) are open; fail2ban blocks password guessers
#   - security updates install themselves every night (no automatic reboots)
#   - Docker from Docker's own repository, with log limits and room for 256 networks
#   - a 4 GB swap file, a cap on system logs, and the /docker and /opt folders
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
[ "$(id -u)" = 0 ] || { echo "Run it with sudo: sudo bash setup.sh"; exit 1; }
step() { echo; echo "== $*"; }

step "Updating Ubuntu"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install ca-certificates curl rsync jq ufw fail2ban unattended-upgrades htop

step "Hostname and clock"
hostnamectl set-hostname srv1
grep -q ' srv1$' /etc/hosts || echo "127.0.1.1 srv1" >> /etc/hosts
timedatectl set-timezone UTC

step "SSH: keys only"
install -d -m 700 /root/.ssh
touch /root/.ssh/authorized_keys
if [ -f /home/ubuntu/.ssh/authorized_keys ]; then
  while read -r k; do
    [ -n "$k" ] && ! grep -qxF "$k" /root/.ssh/authorized_keys && echo "$k" >> /root/.ssh/authorized_keys
  done < /home/ubuntu/.ssh/authorized_keys
fi
chmod 600 /root/.ssh/authorized_keys
[ -s /root/.ssh/authorized_keys ] || { echo "No SSH key found for ubuntu. Stopping so you can't get locked out."; exit 1; }
cat > /etc/ssh/sshd_config.d/10-keys-only.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh

step "Firewall"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

step "Nightly security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52unattended-local <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
systemctl enable --now unattended-upgrades >/dev/null

step "Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Logs capped at 30 MB per container. live-restore keeps apps running while Docker itself updates.
# The address pool gives room for 256 networks (the default runs out near 30; Hostinger already uses 24).
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "default-address-pools": [{ "base": "10.200.0.0/16", "size": 24 }]
}
EOF
systemctl enable docker >/dev/null
systemctl restart docker
usermod -aG docker ubuntu

step "Swap (4 GB) and log limits"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-swap.conf
sysctl -q -p /etc/sysctl.d/90-swap.conf
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/size.conf
systemctl restart systemd-journald

step "Folders"
mkdir -p /docker /opt /root/move

step "Done"
echo "OS:      $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "Docker:  $(docker version -f '{{.Server.Version}}') / compose $(docker compose version --short)"
echo "CPU:     $(nproc) threads, $(lscpu | sed -n 's/^Model name: *//p')"
echo "RAM:     $(free -h | awk '/Mem:/{print $2}'), swap $(free -h | awk '/Swap:/{print $2}')"
echo "Disk /:  $(df -h / | awk 'NR==2{print $4" free of "$2}')"
echo "RAID:    $(grep -c '\[UU\]' /proc/mdstat) mirrors healthy"
ufw status | sed -n '1p'
echo "Next: run the move script on Hostinger (deploy/ovh/move.sh)."
