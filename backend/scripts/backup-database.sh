#!/bin/bash
# Database Backup Script for AI Threat Modeler Dashboard
# 
# This script creates a timestamped backup of the SQLite database
# Usage: ./scripts/backup-database.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="$BACKEND_DIR/data/users.db"
BACKUP_DIR="$BACKEND_DIR/data/backups"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/users.db.backup.$TIMESTAMP"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Database file not found: $DB_PATH"
    exit 1
fi

# Create backup
cp "$DB_PATH" "$BACKUP_FILE"

# Compress backup to save space
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

echo "✅ Database backed up to: $BACKUP_FILE"

# Keep only the last 10 backups
cd "$BACKUP_DIR"
ls -t users.db.backup.*.gz | tail -n +11 | xargs -r rm -f

echo "✅ Backup completed. Old backups cleaned up (keeping last 10)."

