FROM oven/bun:1

WORKDIR /work/repo

RUN mkdir -p /work/repo /work/state /work/artifacts /work/runtime-home /work/cache

ENV HOME=/work/runtime-home/home
ENV XDG_CACHE_HOME=/work/runtime-home/cache
ENV BUN_INSTALL_CACHE_DIR=/work/runtime-home/cache/bun

CMD ["bun", "--version"]
