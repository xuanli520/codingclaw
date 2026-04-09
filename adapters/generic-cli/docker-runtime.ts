import { dirname, isAbsolute, join, resolve } from "node:path";
import { ensureDir, toPosixPath, uniqueStrings, writeJson } from "../../core/loop/support.ts";
import type {
  ContainerPathMap,
  ContainerPathMount,
  ContainerRuntimeConfig,
  RunEnvelope,
  RunExitStatus,
  RunRole,
} from "../../core/contracts/types.ts";

const CONTAINER_PATHS = {
  repo: "/work/repo",
  state: "/work/state",
  artifacts: "/work/artifacts",
  runtimeHome: "/work/runtime-home",
  cache: "/work/cache",
} as const;

const DEFAULT_BASE_IMAGE = "codingclaw-worker-base:phase1-local";

const DEFAULT_ROLE_IMAGES: Record<"builder" | "qa", string> = {
  builder: "codingclaw-worker-builder:phase1-local",
  qa: "codingclaw-worker-qa:phase1-local",
};

const ROLE_IMAGE_ENV_VARS: Record<"builder" | "qa", string> = {
  builder: "CODINGCLAW_WORKER_BUILDER_IMAGE",
  qa: "CODINGCLAW_WORKER_QA_IMAGE",
};

const BASE_IMAGE_ENV_VAR = "CODINGCLAW_WORKER_BASE_IMAGE";
const DOCKER_BIN_ENV_VAR = "CODINGCLAW_DOCKER_BIN";

interface NormalizedContainerPathMount extends ContainerPathMount {
  normalized_host_path: string;
}

export interface RoleImageResolver {
  resolve(runRole: RunRole): string;
}

export interface ContainerizedRunEnvelopeMaterialization {
  host_envelope: RunEnvelope;
  container_envelope: RunEnvelope;
  runtime: ContainerRuntimeConfig;
  host_envelope_path: string;
  container_envelope_path: string;
}

export interface DockerWorkerLaunchRequest {
  run_role: RunRole;
  image: string;
  worker_script_path: string;
  envelope_path: string;
  runtime: ContainerRuntimeConfig;
}

export interface DockerWorkerLaunchResult {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  failure_status: RunExitStatus | null;
}

interface CommandExecutionResult {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  spawn_error: string | null;
}

function normalizeHostPath(value: string): string {
  return toPosixPath(resolve(value)).replace(/\/+$/u, "");
}

function artifactRootFromRunRoot(runRoot: string): string {
  return dirname(dirname(runRoot));
}

export function resolveDockerWorkerImage(runRole: RunRole): string {
  if (runRole !== "builder" && runRole !== "qa") {
    throw new Error(`unsupported docker worker role: ${runRole}`);
  }
  const override = process.env[ROLE_IMAGE_ENV_VARS[runRole]]?.trim();
  return override && override.length > 0 ? override : DEFAULT_ROLE_IMAGES[runRole];
}

export class DockerPathMapper {
  readonly mounts: ContainerPathMount[];
  private readonly normalizedMounts: NormalizedContainerPathMount[];

  constructor(mounts: ContainerPathMount[]) {
    this.mounts = mounts;
    this.normalizedMounts = mounts
      .map((mount) => ({
        ...mount,
        normalized_host_path: normalizeHostPath(mount.host_path),
      }))
      .sort((left, right) => right.normalized_host_path.length - left.normalized_host_path.length);
  }

  mapPath(hostPath: string): string {
    if (!hostPath || !isAbsolute(hostPath)) {
      return hostPath;
    }
    const normalizedPath = normalizeHostPath(hostPath);
    for (const mount of this.normalizedMounts) {
      if (normalizedPath === mount.normalized_host_path) {
        return mount.container_path;
      }
      if (normalizedPath.startsWith(`${mount.normalized_host_path}/`)) {
        return `${mount.container_path}${normalizedPath.slice(mount.normalized_host_path.length)}`;
      }
    }
    return hostPath;
  }

  mapValue(value: unknown): unknown {
    if (typeof value === "string") {
      return this.mapPath(value);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.mapValue(entry));
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, this.mapValue(entry)]));
  }
}

export function buildDockerPathMapping(envelope: RunEnvelope): DockerPathMapper {
  return new DockerPathMapper([
    {
      name: "repo",
      host_path: envelope.repo_path,
      container_path: CONTAINER_PATHS.repo,
      read_only: true,
    },
    {
      name: "state",
      host_path: envelope.state_path,
      container_path: CONTAINER_PATHS.state,
      read_only: false,
    },
    {
      name: "artifacts",
      host_path: artifactRootFromRunRoot(envelope.artifact_path),
      container_path: CONTAINER_PATHS.artifacts,
      read_only: false,
    },
    {
      name: "runtime-home",
      host_path: envelope.runtime_home,
      container_path: CONTAINER_PATHS.runtimeHome,
      read_only: false,
    },
    {
      name: "cache",
      host_path: join(envelope.runtime_home, "cache"),
      container_path: CONTAINER_PATHS.cache,
      read_only: false,
    },
  ]);
}

function buildContainerPathMap(envelope: RunEnvelope, mapper: DockerPathMapper): ContainerPathMap {
  return {
    repo_path: mapper.mapPath(envelope.repo_path),
    state_path: mapper.mapPath(envelope.state_path),
    artifact_path: mapper.mapPath(envelope.artifact_path),
    runtime_home: mapper.mapPath(envelope.runtime_home),
    task_packet_path: mapper.mapPath(envelope.task_packet_path),
    previous_handoff_path: mapper.mapPath(envelope.previous_handoff_path),
    approval_snapshot_path: mapper.mapPath(envelope.approval_snapshot_path),
    trace_context: mapper.mapValue(envelope.trace_context) as Record<string, unknown>,
  };
}

export async function materializeContainerizedRunEnvelope(
  envelope: RunEnvelope,
): Promise<ContainerizedRunEnvelopeMaterialization> {
  const hostEnvelopePath = join(envelope.runtime_home, "envelopes", `${envelope.run_id}.json`);
  const containerEnvelopePath = join(envelope.runtime_home, "envelopes", "container", `${envelope.run_id}.json`);
  const cacheHostPath = join(envelope.runtime_home, "cache");
  const mapper = buildDockerPathMapping(envelope);
  const runtime: ContainerRuntimeConfig = {
    runtime: "docker",
    image: resolveDockerWorkerImage(envelope.run_role),
    workdir: CONTAINER_PATHS.repo,
    envelope_host_path: hostEnvelopePath,
    envelope_container_path: mapper.mapPath(containerEnvelopePath),
    mounts: mapper.mounts,
    container_paths: buildContainerPathMap(envelope, mapper),
  };
  const requestedCapabilities = uniqueStrings([...envelope.requested_capabilities, "container_control"]);
  const hostEnvelope: RunEnvelope = {
    ...envelope,
    requested_capabilities: requestedCapabilities,
    container_runtime: runtime,
  };
  const containerEnvelope: RunEnvelope = {
    ...hostEnvelope,
    repo_path: runtime.container_paths.repo_path,
    state_path: runtime.container_paths.state_path,
    artifact_path: runtime.container_paths.artifact_path,
    runtime_home: runtime.container_paths.runtime_home,
    task_packet_path: runtime.container_paths.task_packet_path,
    previous_handoff_path: runtime.container_paths.previous_handoff_path,
    approval_snapshot_path: runtime.container_paths.approval_snapshot_path,
    trace_context: runtime.container_paths.trace_context,
  };

  await ensureDir(dirname(hostEnvelopePath));
  await ensureDir(dirname(containerEnvelopePath));
  await ensureDir(cacheHostPath);
  await writeJson(hostEnvelopePath, hostEnvelope);
  await writeJson(containerEnvelopePath, containerEnvelope);

  return {
    host_envelope: hostEnvelope,
    container_envelope: containerEnvelope,
    runtime,
    host_envelope_path: hostEnvelopePath,
    container_envelope_path: containerEnvelopePath,
  };
}

function buildImageDockerfile(repoRoot: string, runRole: "base" | "builder" | "qa"): string {
  if (runRole === "base") {
    return join(repoRoot, "docker", "worker-base.Dockerfile");
  }
  return join(repoRoot, "docker", `worker-${runRole}.Dockerfile`);
}

function mountArg(mount: ContainerPathMount): string {
  const mode = mount.read_only ? ",readonly" : "";
  return `type=bind,source=${mount.host_path},target=${mount.container_path}${mode}`;
}

async function spawnCommand(command: string[], cwd: string): Promise<CommandExecutionResult> {
  try {
    const handle = Bun.spawn({
      cmd: command,
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutPromise = new Response(handle.stdout).text();
    const stderrPromise = new Response(handle.stderr).text();
    const exitCode = await handle.exited;
    return {
      command,
      exitCode,
      stdout: await stdoutPromise,
      stderr: await stderrPromise,
      spawn_error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      command,
      exitCode: -1,
      stdout: "",
      stderr: message,
      spawn_error: message,
    };
  }
}

function classifyRunFailure(result: CommandExecutionResult): RunExitStatus | null {
  if (result.exitCode === 0) {
    return null;
  }
  if (result.spawn_error) {
    return "FAILED_INFRA";
  }
  const stderr = result.stderr.trim();
  if (
    /^\s*docker:/iu.test(stderr) ||
    /cannot connect to the docker daemon/iu.test(stderr) ||
    /error during connect/iu.test(stderr)
  ) {
    return "FAILED_INFRA";
  }
  return "FAILED_EXECUTION";
}

export class DockerWorkerLauncher implements RoleImageResolver {
  private readonly preparedImages = new Set<string>();
  private readonly baseImage: string;
  private readonly dockerExecutable: string;

  constructor(private readonly repoRoot: string) {
    const override = process.env[BASE_IMAGE_ENV_VAR]?.trim();
    this.baseImage = override && override.length > 0 ? override : DEFAULT_BASE_IMAGE;
    const dockerOverride = process.env[DOCKER_BIN_ENV_VAR]?.trim();
    this.dockerExecutable = dockerOverride && dockerOverride.length > 0 ? dockerOverride : "docker";
  }

  resolve(runRole: RunRole): string {
    return resolveDockerWorkerImage(runRole);
  }

  private async ensureImage(
    image: string,
    dockerfilePath: string,
    buildArgs: string[] = [],
  ): Promise<CommandExecutionResult | null> {
    if (this.preparedImages.has(image)) {
      return null;
    }

    const inspect = await spawnCommand([this.dockerExecutable, "image", "inspect", image], this.repoRoot);
    if (inspect.spawn_error) {
      return inspect;
    }
    if (inspect.exitCode === 0) {
      this.preparedImages.add(image);
      return null;
    }

    const build = await spawnCommand(
      [this.dockerExecutable, "build", "--file", dockerfilePath, "--tag", image, ...buildArgs, this.repoRoot],
      this.repoRoot,
    );
    if (build.spawn_error || build.exitCode !== 0) {
      return build;
    }
    this.preparedImages.add(image);
    return null;
  }

  private async ensureRoleImage(runRole: RunRole, image: string): Promise<CommandExecutionResult | null> {
    if (runRole !== "builder" && runRole !== "qa") {
      throw new Error(`unsupported docker worker role: ${runRole}`);
    }
    const baseFailure = await this.ensureImage(this.baseImage, buildImageDockerfile(this.repoRoot, "base"));
    if (baseFailure) {
      return baseFailure;
    }
    return this.ensureImage(image, buildImageDockerfile(this.repoRoot, runRole), [
      "--build-arg",
      `CODINGCLAW_BASE_IMAGE=${this.baseImage}`,
    ]);
  }

  async launch(request: DockerWorkerLaunchRequest): Promise<DockerWorkerLaunchResult> {
    const imagePreparationFailure = await this.ensureRoleImage(request.run_role, request.image);
    if (imagePreparationFailure) {
      return {
        command: imagePreparationFailure.command,
        exitCode: imagePreparationFailure.exitCode,
        stdout: imagePreparationFailure.stdout,
        stderr: imagePreparationFailure.stderr,
        failure_status: "FAILED_INFRA",
      };
    }

    const command = [
      this.dockerExecutable,
      "run",
      "--rm",
      "--network",
      "none",
      "--workdir",
      request.runtime.workdir,
      "--env",
      "HOME=/work/runtime-home/home",
      "--env",
      "XDG_CACHE_HOME=/work/cache",
      "--env",
      "BUN_INSTALL_CACHE_DIR=/work/cache/bun",
      ...request.runtime.mounts.flatMap((mount) => ["--mount", mountArg(mount)]),
      request.image,
      "bun",
      request.worker_script_path,
      request.envelope_path,
    ];
    const run = await spawnCommand(command, this.repoRoot);
    return {
      command: run.command,
      exitCode: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      failure_status: classifyRunFailure(run),
    };
  }
}
