# Claude Code Agents for Pi Camera Control

This directory contains specialized Claude Code agents designed to assist with various aspects of the pi-camera-control project. These agents are AI-powered assistants that can be invoked using Claude Code's Task tool.

## Available Agents

### 1. Camera Testing Agent (`camera-testing-agent.md`)
Specializes in testing and validating Canon CCAPI camera integration.

**Use when:**
- Testing camera discovery and connection
- Validating CCAPI endpoints
- Debugging intervalometer timing
- Troubleshooting shooting operations

**Example prompts:**
- "Use the camera testing agent to validate the camera connection"
- "Have the camera testing agent debug why photos aren't being captured"
- "Get the camera testing agent to test intervalometer timing accuracy"

### 2. Network Debugging Agent (`network-debugging-agent.md`)
Expert in diagnosing network issues, especially dual WiFi interface setups.

**Use when:**
- WiFi connection problems
- Access point not working
- Network mode switching issues
- NetworkManager troubleshooting

**Example prompts:**
- "Use the network debugging agent to fix WiFi connection issues"
- "Have the network debugging agent analyze why the access point isn't starting"
- "Get the network debugging agent to test network mode switching"

### 3. Deployment Helper Agent (`deployment-helper-agent.md`)
Automates deployment and setup of the project on Raspberry Pi devices.

**Use when:**
- Setting up a new Raspberry Pi
- Installing the systemd service
- Configuring network interfaces
- Validating production deployment

**Example prompts:**
- "Use the deployment helper agent to set up my Raspberry Pi Zero 2W"
- "Have the deployment helper agent install the systemd service"
- "Get the deployment helper agent to validate the production setup"

### 4. System Health Agent (`system-health-agent.md`)
Monitors and optimizes Raspberry Pi system performance.

**Use when:**
- Checking system resource usage
- Thermal throttling issues
- Power optimization needed
- Service health problems

**Example prompts:**
- "Use the system health agent to check if the Pi is overheating"
- "Have the system health agent optimize power consumption"
- "Get the system health agent to diagnose service crashes"

### 5. Timelapse Analysis Agent (`timelapse-analysis-agent.md`)
Optimizes timelapse sessions and analyzes results.

**Use when:**
- Planning long timelapse sessions
- Calculating optimal settings
- Debugging session issues
- Analyzing captured sequences

**Example prompts:**
- "Use the timelapse analysis agent to plan a 6-hour Milky Way timelapse"
- "Have the timelapse analysis agent optimize my interval settings"
- "Get the timelapse analysis agent to analyze why frames were dropped"

## How to Use These Agents

When working with Claude Code on this project, you can invoke these specialized agents for specific tasks:

1. **Direct invocation**: Ask Claude Code to use a specific agent
   ```
   "Use the camera testing agent to validate all CCAPI endpoints"
   ```

2. **Problem-focused**: Describe your problem and let Claude Code choose the appropriate agent
   ```
   "The camera isn't being discovered on the network"
   ```

3. **Multi-agent workflows**: Combine agents for complex tasks
   ```
   "Set up my Pi and then test the camera connection"
   ```

## Agent Capabilities

All agents can:
- Read and analyze project code
- Examine system logs and configuration
- Run diagnostic commands
- Provide detailed reports
- Suggest specific fixes
- Execute remediation steps

## Implementation Notes

These agents are designed to work with:
- The pi-camera-control Node.js backend
- Raspberry Pi Zero W/2W hardware
- Canon cameras with CCAPI support
- NetworkManager-based WiFi management
- systemd service deployment

Each agent has deep knowledge of:
- Project architecture and components
- System configuration requirements
- Common issues and solutions
- Best practices for the domain

## Getting Started

1. Ensure Claude Code has access to your project repository
2. Describe your task or problem
3. Claude Code will automatically use the appropriate agent(s)
4. Follow the agent's recommendations and let it execute fixes

## Tips for Best Results

- Be specific about your problem or goal
- Provide error messages or symptoms you're seeing
- Let agents complete their analysis before interrupting
- Use multiple agents in sequence for complex workflows
- Trust the agents' domain expertise

## Feedback and Improvements

These agents are continuously improved based on:
- Common issues encountered
- New features in the project
- User feedback and requests
- System updates and changes

For agent-specific documentation, see the individual `.md` files in this directory.