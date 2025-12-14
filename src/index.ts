/**
 * Main entry point for AI Threat Modeler
 * 
 * This is a simple example application built on top of appsec-agent
 */

import { AgentActions, AgentArgs, loadYaml } from 'appsec-agent';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 AI Threat Modeler Starting...\n');

  // Load configuration
  // Try to find config in appsec-agent package first, then fallback to local
  let configPath = path.join(__dirname, '..', 'node_modules', 'appsec-agent', 'conf', 'appsec_agent.yaml');
  if (!fs.existsSync(configPath)) {
    configPath = path.join(__dirname, '..', '..', 'appsec-agent', 'conf', 'appsec_agent.yaml');
  }
  
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Configuration file not found. Tried: ${configPath}`);
    process.exit(1);
  }
  
  const confDict = loadYaml(configPath);

  if (!confDict) {
    console.error('❌ Failed to load configuration');
    process.exit(1);
  }

  // Example: Simple query agent
  const args: AgentArgs = {
    role: 'simple_query_agent',
    environment: 'development',
    verbose: false
  };

  const agentActions = new AgentActions(confDict, args.environment, args);

  // Example usage - you can customize this
  console.log('📝 Example: Running simple query agent');
  console.log('(This is a placeholder - customize based on your needs)\n');

  // Uncomment to actually run:
  // await agentActions.simpleQueryClaudeWithOptions('What are common OWASP Top 10 vulnerabilities?');

  console.log('✅ App initialized successfully!');
  console.log('\n💡 Next steps:');
  console.log('   - Customize this file for your use case');
  console.log('   - Check IDEAS.md for project suggestions');
  console.log('   - Build your threat modeling workflow');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

