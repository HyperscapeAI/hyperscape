# ElizaOS Plugin

This is an ElizaOS plugin built with the official plugin starter template.

## Getting Started

```bash
# Create a new plugin (automatically adds "plugin-" prefix)
elizaos create -t plugin solana
# This creates: plugin-solana
# Dependencies are automatically installed and built

# Navigate to the plugin directory
cd plugin-solana

# Start development immediately
elizaos dev
```

## Development

```bash
# Start development with hot-reloading (recommended)
elizaos dev

# OR start without hot-reloading
elizaos start
# Note: When using 'start', you need to rebuild after changes:
# bun run build

# Test the plugin
elizaos test
```

## Testing

ElizaOS provides a comprehensive testing structure for plugins:

### Test Structure

- **Component Tests** (`__tests__/` directory):

  - **Unit Tests**: Test individual functions/classes in isolation
  - **Integration Tests**: Test how components work together
  - Run with: `elizaos test component`

- **End-to-End Tests** (`__tests__/e2e/` directory):

  - Test the plugin within a full ElizaOS runtime
  - Validate complete user scenarios with a real agent
  - Run with: `elizaos test e2e`

- **Running All Tests**:
  - `elizaos test` runs both component and e2e tests

### Writing Tests

Component tests use Vitest:

```typescript
// Unit test example (__tests__/plugin.test.ts)
describe('Plugin Configuration', () => {
  it('should have correct plugin metadata', () => {
    expect(starterPlugin.name).toBe('plugin-hyperscape');
  });
});

// Integration test example (__tests__/integration.test.ts)
describe('Integration: HelloWorld Action with StarterService', () => {
  it('should handle HelloWorld action with StarterService', async () => {
    // Test interactions between components
  });
});
```

E2E tests run in a real ElizaOS runtime:

```typescript
// E2E test example (__tests__/e2e/starter-plugin.ts)
export const StarterPluginTestSuite: TestSuite = {
  name: 'plugin_starter_test_suite',
  description: 'E2E tests for the starter plugin',
  tests: [
    {
      name: 'hello_world_action_test',
      fn: async (runtime) => {
        // Simulate user asking agent to say hello
        const testMessage = {
          content: { text: 'Can you say hello?' }
        };

        // Execute action and capture response
        const response = await helloWorldAction.handler(runtime, testMessage, ...);

        // Verify agent responds with "hello world"
        if (!response.text.includes('hello world')) {
          throw new Error('Expected "hello world" in response');
        }
      },
    },
  ],
};
```

#### Key E2E Testing Features:

- **Real Runtime Environment**: Tests run with a fully initialized ElizaOS runtime
- **Plugin Interaction**: Test how your plugin behaves with the actual agent
- **Scenario Testing**: Validate complete user interactions, not just individual functions
- **No Mock Required**: Access real services, actions, and providers

#### Writing New E2E Tests:

1. Add a new test object to the `tests` array in your test suite
2. Each test receives the runtime instance as a parameter
3. Throw errors to indicate test failures (no assertion library needed)
4. See the comprehensive documentation in `__tests__/e2e/starter-plugin.ts` for detailed examples

The test utilities in `__tests__/test-utils.ts` provide mock objects and setup functions to simplify writing component tests.

## Publishing & Continuous Development

### Initial Setup

Before publishing your plugin, ensure you meet these requirements:

1. **npm Authentication**

   ```bash
   npm login
   ```

2. **GitHub Repository**

   - Create a public GitHub repository for this plugin
   - Add the 'elizaos-plugins' topic to the repository
   - Use 'main' as the default branch

3. **Required Assets**
   - Add images to the `images/` directory:
     - `logo.jpg` (400x400px square, <500KB)
     - `banner.jpg` (1280x640px, <1MB)

### Initial Publishing

```bash
# Test your plugin meets all requirements
elizaos publish --test

# Publish to npm + GitHub + registry (recommended)
elizaos publish
```

This command will:

- Publish your plugin to npm for easy installation
- Create/update your GitHub repository
- Submit your plugin to the ElizaOS registry for discoverability

### Continuous Development & Updates

**Important**: After your initial publish with `elizaos publish`, all future updates should be done using standard npm and git workflows, not the ElizaOS CLI.

#### Standard Update Workflow

1. **Make Changes**

   ```bash
   # Edit your plugin code
   elizaos dev  # Test locally with hot-reload
   ```

2. **Test Your Changes**

   ```bash
   # Run all tests
   elizaos test

   # Run specific test types if needed
   elizaos test component  # Component tests only
   elizaos test e2e       # E2E tests only
   ```

3. **Update Version**

   ```bash
   # Patch version (bug fixes): 1.0.0 → 1.0.1
   npm version patch

   # Minor version (new features): 1.0.1 → 1.1.0
   npm version minor

   # Major version (breaking changes): 1.1.0 → 2.0.0
   npm version major
   ```

4. **Publish to npm**

   ```bash
   npm publish
   ```

5. **Push to GitHub**
   ```bash
   git push origin main
   git push --tags  # Push version tags
   ```

#### Why Use Standard Workflows?

- **npm publish**: Directly updates your package on npm registry
- **git push**: Updates your GitHub repository with latest code
- **Automatic registry updates**: The ElizaOS registry automatically syncs with npm, so no manual registry updates needed
- **Standard tooling**: Uses familiar npm/git commands that work with all development tools

### Alternative Publishing Options (Initial Only)

```bash
# Publish to npm only (skip GitHub and registry)
elizaos publish --npm

# Publish but skip registry submission
elizaos publish --skip-registry

# Generate registry files locally without publishing
elizaos publish --dry-run
```

## Configuration

The `agentConfig` section in `package.json` defines the parameters your plugin requires:

```json
"agentConfig": {
  "pluginType": "elizaos:plugin:1.0.0",
  "pluginParameters": {
    "API_KEY": {
      "type": "string",
      "description": "API key for the service"
    }
  }
}
```

Customize this section to match your plugin's requirements.

## Content Packs

The Hyperscape plugin supports modular content packs that extend agent capabilities with custom actions, providers, evaluators, and game systems.

### Built-in Content Pack

The **Runescape RPG Pack** is automatically loaded when the service starts. It includes:

- **6 RPG Actions**:
  - `chopTree` - Chop trees for woodcutting XP
  - `catchFish` - Fish at fishing spots for fishing XP
  - `cookFood` - Cook raw food for cooking XP
  - `lightFire` - Light fires for firemaking XP
  - `bankItems` - Deposit items at banks
  - `checkInventory` - View inventory contents

- **2 RPG Providers**:
  - `banking` - Nearby banks and inventory status
  - `character` - Character stats, skills, and equipment

- **4 System Bridges**:
  - Skills system validation
  - Inventory system validation
  - Banking system validation
  - Resource system validation

- **Visual Configuration**:
  - Entity color mappings for testing
  - UI theme definitions

### Loading Custom Content Packs

```typescript
import { HyperscapeService } from '@hyperscape/plugin-hyperscape';
import type { IContentPack } from '@hyperscape/plugin-hyperscape';

const runtime = getRuntime(); // Your ElizaOS runtime
const service = runtime.getService<HyperscapeService>('hyperscape');

// Define a custom content pack
const myContentPack: IContentPack = {
  id: 'my-custom-pack',
  name: 'My Custom Pack',
  version: '1.0.0',
  description: 'Custom gameplay mechanics',

  actions: [...], // Your custom actions
  providers: [...], // Your custom providers
  evaluators: [...], // Your custom evaluators
  systems: [...], // Your custom game systems

  onLoad: async (runtime, world) => {
    console.log('Content pack loaded!');
  },
};

// Load the content pack
await service.loadContentPack(myContentPack);

// Check if a pack is loaded
if (service.isContentPackLoaded('my-custom-pack')) {
  console.log('Pack is active');
}

// Get all loaded packs
const packs = service.getLoadedContentPacks();

// Unload a pack
await service.unloadContentPack('my-custom-pack');
```

### Creating Content Packs

See [content-pack.ts](./src/content-packs/content-pack.ts) for a complete example.

Key interfaces:
- `IContentPack` - Main content pack definition
- `IGameSystem` - Game system lifecycle hooks
- `IStateManager` - Per-player state management
- `IVisualConfig` - Visual testing configuration

## Message Processing Architecture

The Hyperscape plugin uses the standard ElizaOS message processing pipeline with world context injection.

### Flow

1. **WebSocket Message** → Chat subscription in HyperscapeService
2. **Memory Creation** → MessageManager converts to ElizaOS Memory format
3. **State Composition** → `runtime.composeState()` gathers provider context
4. **Action Processing** → `runtime.processActions()` evaluates and executes actions
5. **LLM Fallback** → Generates conversational response if no action matches
6. **Response Broadcast** → `Chat.add()` sends response to all clients

### World Context Injection

The `worldContextProvider` automatically injects Hyperscape world state into the LLM context:

- **Agent Position**: (x, y, z) coordinates
- **Nearby Entities**: Entities within 10m radius
- **Entity Details**: Type, name, distance for each nearby entity

This context is automatically available in `state.text` for all actions and evaluators, enabling location-aware agent behavior.

### Extending Message Processing

To customize message handling:

- **Add Actions**: Register new Action objects in the plugin to handle specific commands
- **Add Providers**: Create providers to inject custom context into the state
- **Add Evaluators**: Process messages post-action for analysis and learning

### Example: Accessing World Context in Actions

```typescript
// In your custom action handler
handler: async (runtime, message, state) => {
  // World context is already in state.text
  // Access structured data from worldContextProvider
  const position = state.data.position; // { x, y, z }
  const nearbyEntities = state.data.nearbyEntities; // Entity[]

  // Your action logic here
}
```

## Documentation

Provide clear documentation about:

- What your plugin does
- How to use it
- Required API keys or credentials
- Example usage
- Version history and changelog
