FROM oven/bun:1

WORKDIR /work/repo

RUN mkdir -p /work/repo /work/state /work/artifacts /work/runtime-home /work/cache

ENV HOME=/work/runtime-home/home
ENV XDG_CACHE_HOME=/work/cache
ENV BUN_INSTALL_CACHE_DIR=/work/cache/bun

CMD ["bun", "--version"]
