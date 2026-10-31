# Nightly encrypted backups of the database and uploaded files to Cloudflare R2.
# pg_dump must be at least the server's major version (the database is PG 18).
FROM postgres:18-alpine
RUN apk add --no-cache rclone openssl coreutils tzdata
COPY docker/backup/zaboni-backup.sh /usr/local/bin/zaboni-backup
RUN chmod +x /usr/local/bin/zaboni-backup
ENV TZ=Asia/Damascus
ENTRYPOINT ["/usr/local/bin/zaboni-backup"]
CMD ["daemon"]
