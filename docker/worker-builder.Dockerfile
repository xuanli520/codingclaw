ARG CODINGCLAW_BASE_IMAGE=codingclaw-worker-base:phase1-local
FROM ${CODINGCLAW_BASE_IMAGE}

WORKDIR /work/repo

ENV CODINGCLAW_WORKER_ROLE=builder

CMD ["bun", "--version"]
