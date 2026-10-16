import { AgentManifest, type CiExportInput } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
export const sha256 = async (text: string) => (await import('node:crypto')).createHash('sha256').update(text).digest('hex');

export function generateWorkflow(input: CiExportInput, rawManifest: AgentManifest): string {
  const manifest = AgentManifest.parse(rawManifest);
  if (!manifest.agent_id) throw new ValidationError('CI workflow requires a studio agent identity');
  const ollama = manifest.provider === 'ollama';
  const posting = input.post_as !== 'none';
  return `name: DevDigest Review
on:
  pull_request:
    types: [${input.triggers.join(', ')}]
permissions:
  contents: read
${posting ? '  pull-requests: write\n' : ''}concurrency:
  group: devdigest-review-\${{ github.event.pull_request.number }}
  cancel-in-progress: true
jobs:
  review:
    name: DevDigest review
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Check out trusted base configuration
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          path: trusted
          persist-credentials: false
      - name: Verify trusted base installation
        id: base_config
        shell: bash
        run: |
          set -euo pipefail
          if [[ -f "trusted/.devdigest/runner/index.js" && -f "trusted/.devdigest/runner/300.index.js" && -f "trusted/.devdigest/runner/package.json" && -f "trusted/.devdigest/agents/agent-${manifest.agent_id}.yaml" ]]; then
            echo 'ready=true' >> "$GITHUB_OUTPUT"
          else
            echo 'ready=false' >> "$GITHUB_OUTPUT"
            if [[ -f "trusted/.github/workflows/devdigest-review.yml" ]]; then
              echo '::error::Trusted base CI installation is incomplete; repair its runner and selected agent configuration before review.'
              exit 1
            fi
            echo '::notice::DevDigest configuration first appears in this installation PR; review starts after merge. No review or artifact was produced.'
          fi
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        if: steps.base_config.outputs.ready == 'true'
        with:
          node-version: '22'
${ollama ? `      - name: Start verified local model runtime
        if: steps.base_config.outputs.ready == 'true'
        shell: bash
        env:
          OLLAMA_HOST: 127.0.0.1:11434
          OLLAMA_MODELS: \${{ runner.temp }}/ollama-models
          CI_MODEL: '${manifest.model}'
        run: |
          set -euo pipefail
          curl --fail --location --retry 3 https://github.com/ollama/ollama/releases/download/v0.6.8/ollama-linux-amd64.tgz -o "$RUNNER_TEMP/ollama.tgz"
          echo '9f9ff52b8297d6e40904f22bac09eac587a05111762bf278359621fbdb53dbb9  '"$RUNNER_TEMP/ollama.tgz" | sha256sum --check
          mkdir -p "$RUNNER_TEMP/ollama"
          tar -xzf "$RUNNER_TEMP/ollama.tgz" -C "$RUNNER_TEMP/ollama"
          "$RUNNER_TEMP/ollama/bin/ollama" serve > "$RUNNER_TEMP/ollama.log" 2>&1 &
          for attempt in {1..90}; do curl --fail --silent http://127.0.0.1:11434/api/version && break; sleep 1; done
          curl --fail --silent http://127.0.0.1:11434/api/version
          timeout 720 "$RUNNER_TEMP/ollama/bin/ollama" pull "$CI_MODEL"
` : ''}      - name: Review PR diff through grounded reviewer-core
        if: steps.base_config.outputs.ready == 'true'
        run: node trusted/.devdigest/runner/index.js
        env:
          GITHUB_TOKEN: \${{ github.token }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          DEVDIGEST_DIR: \${{ github.workspace }}/trusted/.devdigest
          DEVDIGEST_MANIFEST: agents/agent-${manifest.agent_id}.yaml
          DEVDIGEST_WORKFLOW_SHA: \${{ github.event.pull_request.base.sha }}
          DEVDIGEST_RESULT_PATH: \${{ github.workspace }}/devdigest-result.json
          DEVDIGEST_POST_AS: ${input.post_as}
${ollama ? '' : '          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}\n'}      - name: Upload grounded review result
        if: always() && steps.base_config.outputs.ready == 'true'
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: devdigest-result
          path: devdigest-result.json
          retention-days: 14
          if-no-files-found: warn
`;
}

/** Editable title/comments; execution/security settings come from validated form fields. */
export function validateEditedWorkflow(proposed: string, generated: string): string {
  const normalize = (text: string) => text.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#')).map(line => line.startsWith('name: ') ? 'name: <editable>' : line).join('\n');
  if (normalize(proposed) !== normalize(generated)) throw new ValidationError('Workflow execution settings must match Configure. Only the workflow title and comments may be edited.');
  if (!/^name: [A-Za-z0-9 _.-]{1,80}$/m.test(proposed)) throw new ValidationError('Workflow title must be plain text');
  const lf = proposed.replace(/\r\n/g, '\n');
  return lf.endsWith('\n') ? lf : `${lf}\n`;
}
