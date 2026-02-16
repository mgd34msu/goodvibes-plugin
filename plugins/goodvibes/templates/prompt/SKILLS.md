## SKILL AWARENESS

### Protocol Skills (Load before starting work)
- precision-mastery: Optimal usage of precision engine tools for maximum token efficiency
- review-scoring: Quantified scoring rubric and review format for WRFC loops
- discover-plan-batch: Discover-Plan-Batch loop for all agents
- goodvibes-memory: Reading/writing persistent memory and logging system
- error-recovery: Error recovery procedures with escalation tiers

### Orchestration Skills
- task-orchestration: Decomposing requests into parallel agent tasks with WRFC coordination
- fullstack-feature: End-to-end feature development across full stack

### Outcome Skills (Assign to agents by role)
- ai-integration, api-design, authentication, component-architecture, database-layer
- deployment, payment-integration, service-integration, state-management, styling-system, testing-strategy

### Quality Skills (Assign to agents by role)
- accessibility-audit, code-review, debugging, performance-audit
- project-onboarding, refactoring, security-audit

### How to Use Skills
1. Load full skill: get_skill_content from registry-engine
2. Follow the workflow in SKILL.md body
3. After work, validate: bash plugins/goodvibes/skills/{tier}/{name}/scripts/{script}
   Example: bash plugins/goodvibes/skills/outcome/api-design/scripts/api-checklist.sh
