#!/bin/bash

# Deploy script for testing on a remote Homebridge instance
# Copy this file to deploy.sh and fill in your values

# Configuration - UPDATE THESE VALUES
NAS_USER="your_username"
NAS_IP="your_nas_ip"
CONTAINER_ID="your_container_id"
PACKAGE_NAME="homebridge-tuya-pool-heater-1.0.0.tgz"

# SSH ControlMaster for single password prompt
CONTROL_PATH="/tmp/ssh-deploy-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=60"

# Cleanup control socket on exit
cleanup() {
    ssh -O exit -o ControlPath="$CONTROL_PATH" "${NAS_USER}@${NAS_IP}" 2>/dev/null
}
trap cleanup EXIT

echo "=== Building plugin ==="
npm run build
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "=== Packing plugin ==="
npm pack
if [ $? -ne 0 ]; then
    echo "Pack failed!"
    exit 1
fi

echo "=== Copying to NAS ==="
scp $SSH_OPTS "$PACKAGE_NAME" "${NAS_USER}@${NAS_IP}:/tmp/"
if [ $? -ne 0 ]; then
    echo "SCP failed!"
    exit 1
fi

echo "=== Installing and restarting on NAS ==="
ssh $SSH_OPTS "${NAS_USER}@${NAS_IP}" "bash -l -c '
    echo \"Copying into container...\"
    docker cp /tmp/${PACKAGE_NAME} ${CONTAINER_ID}:/tmp/
    echo \"Installing plugin...\"
    docker exec ${CONTAINER_ID} npm install --prefix /homebridge /tmp/${PACKAGE_NAME}
    echo \"Cleaning up container...\"
    docker exec ${CONTAINER_ID} rm -f /tmp/${PACKAGE_NAME}
    echo \"Cleaning up NAS...\"
    rm -f /tmp/${PACKAGE_NAME}
    echo \"Restarting Homebridge...\"
    docker restart ${CONTAINER_ID}
'"

echo "=== Cleaning up local files ==="
rm -f "$PACKAGE_NAME"

echo ""
echo "=== Done! ==="
