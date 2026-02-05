FROM postgres:16-alpine
COPY rollup.sql /app/rollup.sql
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
