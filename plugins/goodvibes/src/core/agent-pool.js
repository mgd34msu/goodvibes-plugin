"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentPool = void 0;
var crypto_1 = require("crypto");
/** Default configuration */
var DEFAULT_CONFIG = {
    max_concurrent: 6,
    default_budget: 50000,
    total_budget: 500000,
    auto_start: true,
    budget_warning_threshold: 0.8,
    pricing: {
        // Claude Sonnet 3.5 pricing as default
        input_per_million: 3.0,
        output_per_million: 15.0,
    },
    auto_pause_on_exhaustion: true,
};
/**
 * Manages a pool of agents with budget tracking and dependency management.
 */
var AgentPool = /** @class */ (function () {
    /**
     * Creates a new AgentPool instance.
     */
    function AgentPool(config) {
        if (config === void 0) { config = {}; }
        this.totalSpent = 0;
        this.recentSpawns = [];
        // Event callbacks
        this.onAgentStart = null;
        this.onAgentComplete = null;
        this.onAgentFail = null;
        this.onBudgetWarning = null;
        this.onBudgetExhausted = null;
        this.onSequentialSpawnDetected = null;
        this.config = __assign(__assign({}, DEFAULT_CONFIG), config);
        this.agents = new Map();
        this.queue = [];
    }
    /**
     * Spawns a new agent and adds it to the pool.
     * @returns The agent ID
     */
    AgentPool.prototype.spawn = function (spec) {
        var _this = this;
        var id = (0, crypto_1.randomUUID)();
        // Track spawn timing for sequential detection
        var now = Date.now();
        this.recentSpawns.push({ id: id, timestamp: now });
        // Clean old entries (older than 5 seconds)
        this.recentSpawns = this.recentSpawns.filter(function (s) { return now - s.timestamp < 5000; });
        // Detect sequential pattern (multiple spawns in quick succession)
        if (this.recentSpawns.length >= 2 && this.onSequentialSpawnDetected) {
            this.onSequentialSpawnDetected({
                count: this.recentSpawns.length,
                suggestion: 'Spawn independent agents in a single Task() call batch for parallel execution',
            });
        }
        var budget = spec.budget || this.config.default_budget;
        var agent = {
            id: id,
            spec: __assign(__assign({}, spec), { budget: budget }),
            status: "queued",
            queued_at: new Date().toISOString(),
            budget: {
                allocated: budget,
                spent: 0,
                remaining: budget,
                exhausted: false,
                usage_percent: 0,
                input_tokens: 0,
                output_tokens: 0,
                cost_usd: 0,
            },
        };
        this.agents.set(id, agent);
        this.queue.push(id);
        // Check dependencies
        if (spec.depends_on && spec.depends_on.length > 0) {
            var pendingDeps = spec.depends_on.filter(function (depId) {
                var dep = _this.agents.get(depId);
                return dep && dep.status !== "completed";
            });
            if (pendingDeps.length > 0) {
                agent.status = "waiting";
            }
        }
        // Try to start if auto_start and not waiting
        if (this.config.auto_start && agent.status === "queued") {
            this.tryStartNext();
        }
        return id;
    };
    /**
     * Tries to start the next queued agent if capacity allows.
     */
    AgentPool.prototype.tryStartNext = function () {
        var activeCount = this.getActiveCount();
        if (activeCount >= this.config.max_concurrent) {
            return;
        }
        // Find next agent that can start
        for (var _i = 0, _a = this.queue; _i < _a.length; _i++) {
            var agentId = _a[_i];
            var agent = this.agents.get(agentId);
            if (!agent)
                continue;
            if (agent.status === "queued" && this.canStart(agent)) {
                this.startAgent(agentId);
                break;
            }
        }
    };
    /**
     * Checks if an agent can start (dependencies met).
     */
    AgentPool.prototype.canStart = function (agent) {
        var _this = this;
        if (!agent.spec.depends_on || agent.spec.depends_on.length === 0) {
            return true;
        }
        return agent.spec.depends_on.every(function (depId) {
            var dep = _this.agents.get(depId);
            return dep && dep.status === "completed";
        });
    };
    /**
     * Starts an agent.
     */
    AgentPool.prototype.startAgent = function (agentId) {
        var agent = this.agents.get(agentId);
        if (!agent)
            return;
        agent.status = "running";
        agent.started_at = new Date().toISOString();
        // Remove from queue
        this.queue = this.queue.filter(function (id) { return id !== agentId; });
        // Trigger callback
        if (this.onAgentStart) {
            this.onAgentStart(agent);
        }
    };
    /**
     * Gets an agent by ID.
     */
    AgentPool.prototype.getAgent = function (id) {
        var agent = this.agents.get(id);
        return agent ? __assign({}, agent) : undefined;
    };
    /**
     * Calculates cost from token counts.
     */
    AgentPool.prototype.calculateCost = function (inputTokens, outputTokens) {
        var inputCost = (inputTokens / 1000000) * this.config.pricing.input_per_million;
        var outputCost = (outputTokens / 1000000) * this.config.pricing.output_per_million;
        return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
    };
    /**
     * Updates an agent's token usage (simple version - total tokens only).
     */
    AgentPool.prototype.updateBudget = function (agentId, tokensUsed) {
        // Assume 20% input, 80% output as default split if not specified
        var inputTokens = Math.floor(tokensUsed * 0.2);
        var outputTokens = tokensUsed - inputTokens;
        this.updateBudgetDetailed(agentId, inputTokens, outputTokens);
    };
    /**
     * Updates an agent's token usage with detailed input/output breakdown.
     */
    AgentPool.prototype.updateBudgetDetailed = function (agentId, inputTokens, outputTokens) {
        var agent = this.agents.get(agentId);
        if (!agent)
            return;
        var totalTokens = inputTokens + outputTokens;
        var cost = this.calculateCost(inputTokens, outputTokens);
        agent.budget.input_tokens = inputTokens;
        agent.budget.output_tokens = outputTokens;
        agent.budget.spent = totalTokens;
        agent.budget.remaining = agent.budget.allocated - totalTokens;
        agent.budget.usage_percent = (totalTokens / agent.budget.allocated) * 100;
        agent.budget.cost_usd = cost;
        var wasExhausted = agent.budget.exhausted;
        agent.budget.exhausted = agent.budget.remaining <= 0;
        // Check for budget warning
        if (agent.budget.usage_percent >= this.config.budget_warning_threshold * 100 &&
            this.onBudgetWarning) {
            this.onBudgetWarning(agent);
        }
        // Check for budget exhausted (only trigger once)
        if (agent.budget.exhausted && !wasExhausted) {
            if (this.onBudgetExhausted) {
                this.onBudgetExhausted(agent);
            }
            // Auto-pause if configured
            if (this.config.auto_pause_on_exhaustion && agent.status === "running") {
                this.pause(agentId);
            }
        }
    };
    /**
     * Pauses a running agent (typically due to budget exhaustion).
     */
    AgentPool.prototype.pause = function (agentId) {
        var agent = this.agents.get(agentId);
        if (!agent || agent.status !== "running")
            return false;
        agent.status = "paused";
        return true;
    };
    /**
     * Resumes a paused agent.
     */
    AgentPool.prototype.resume = function (agentId) {
        var agent = this.agents.get(agentId);
        if (!agent || agent.status !== "paused")
            return false;
        // Only resume if budget allows
        if (agent.budget.exhausted) {
            return false;
        }
        agent.status = "running";
        return true;
    };
    /**
     * Adds additional budget to an agent (top-up).
     */
    AgentPool.prototype.topUp = function (agentId, additionalTokens) {
        var agent = this.agents.get(agentId);
        if (!agent)
            return false;
        agent.budget.allocated += additionalTokens;
        agent.budget.remaining += additionalTokens;
        agent.budget.usage_percent = (agent.budget.spent / agent.budget.allocated) * 100;
        agent.budget.exhausted = agent.budget.remaining <= 0;
        // Auto-resume if was paused due to exhaustion and now has budget
        if (agent.status === "paused" && !agent.budget.exhausted) {
            agent.status = "running";
        }
        return true;
    };
    /**
     * Gets all paused agents.
     */
    AgentPool.prototype.getPausedAgents = function () {
        return Array.from(this.agents.values())
            .filter(function (a) { return a.status === "paused"; })
            .map(function (a) { return (__assign({}, a)); });
    };
    /**
     * Marks an agent as completed.
     */
    AgentPool.prototype.complete = function (agentId, result, tokensSpent) {
        var agent = this.agents.get(agentId);
        if (!agent)
            return;
        agent.status = "completed";
        agent.ended_at = new Date().toISOString();
        agent.result = result;
        if (tokensSpent !== undefined) {
            this.updateBudget(agentId, tokensSpent);
            this.totalSpent += tokensSpent;
        }
        // Trigger spec callback
        if (agent.spec.on_complete) {
            agent.spec.on_complete(agent);
        }
        // Trigger pool callback
        if (this.onAgentComplete) {
            this.onAgentComplete(agent);
        }
        // Check for waiting agents that can now start
        this.processWaitingAgents();
        // Try to start next queued agent
        if (this.config.auto_start) {
            this.tryStartNext();
        }
    };
    /**
     * Marks an agent as failed.
     */
    AgentPool.prototype.fail = function (agentId, error, tokensSpent) {
        var agent = this.agents.get(agentId);
        if (!agent)
            return;
        agent.status = "failed";
        agent.ended_at = new Date().toISOString();
        agent.error = error;
        if (tokensSpent !== undefined) {
            this.updateBudget(agentId, tokensSpent);
            this.totalSpent += tokensSpent;
        }
        // Trigger spec callback
        if (agent.spec.on_fail) {
            agent.spec.on_fail(agent);
        }
        // Trigger pool callback
        if (this.onAgentFail) {
            this.onAgentFail(agent);
        }
        // Try to start next queued agent
        if (this.config.auto_start) {
            this.tryStartNext();
        }
    };
    /**
     * Processes waiting agents to see if they can start.
     */
    AgentPool.prototype.processWaitingAgents = function () {
        for (var _i = 0, _a = this.agents.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], agent = _b[1];
            if (agent.status === "waiting" && this.canStart(agent)) {
                agent.status = "queued";
                if (this.config.auto_start) {
                    this.tryStartNext();
                }
            }
        }
    };
    /**
     * Gets the count of active (running) agents.
     */
    AgentPool.prototype.getActiveCount = function () {
        return Array.from(this.agents.values()).filter(function (a) { return a.status === "running"; }).length;
    };
    /**
     * Gets all active agents.
     */
    AgentPool.prototype.getActiveAgents = function () {
        return Array.from(this.agents.values())
            .filter(function (a) { return a.status === "running"; })
            .map(function (a) { return (__assign({}, a)); });
    };
    /**
     * Gets all queued agents.
     */
    AgentPool.prototype.getQueuedAgents = function () {
        return Array.from(this.agents.values())
            .filter(function (a) { return a.status === "queued"; })
            .map(function (a) { return (__assign({}, a)); });
    };
    /**
     * Gets all waiting agents.
     */
    AgentPool.prototype.getWaitingAgents = function () {
        return Array.from(this.agents.values())
            .filter(function (a) { return a.status === "waiting"; })
            .map(function (a) { return (__assign({}, a)); });
    };
    /**
     * Gets pool statistics.
     */
    AgentPool.prototype.getStats = function () {
        var agents = Array.from(this.agents.values());
        var totalAllocated = agents.reduce(function (sum, a) { return sum + a.budget.allocated; }, 0);
        var totalSpent = agents.reduce(function (sum, a) { return sum + a.budget.spent; }, 0);
        var totalInputTokens = agents.reduce(function (sum, a) { return sum + a.budget.input_tokens; }, 0);
        var totalOutputTokens = agents.reduce(function (sum, a) { return sum + a.budget.output_tokens; }, 0);
        var totalCost = agents.reduce(function (sum, a) { return sum + a.budget.cost_usd; }, 0);
        return {
            total_spawned: agents.length,
            active: agents.filter(function (a) { return a.status === "running"; }).length,
            queued: agents.filter(function (a) { return a.status === "queued"; }).length,
            waiting: agents.filter(function (a) { return a.status === "waiting"; }).length,
            paused: agents.filter(function (a) { return a.status === "paused"; }).length,
            completed: agents.filter(function (a) { return a.status === "completed"; }).length,
            failed: agents.filter(function (a) { return a.status === "failed"; }).length,
            total_budget_allocated: totalAllocated,
            total_budget_spent: totalSpent,
            budget_remaining: this.config.total_budget - totalSpent,
            total_input_tokens: totalInputTokens,
            total_output_tokens: totalOutputTokens,
            total_cost_usd: Math.round(totalCost * 10000) / 10000,
        };
    };
    /**
     * Gets agents by status.
     */
    AgentPool.prototype.getAgentsByStatus = function (status) {
        return Array.from(this.agents.values())
            .filter(function (a) { return a.status === status; })
            .map(function (a) { return (__assign({}, a)); });
    };
    /**
     * Checks if total budget allows spawning another agent.
     */
    AgentPool.prototype.hasBudget = function (requestedBudget) {
        var budget = requestedBudget || this.config.default_budget;
        var stats = this.getStats();
        return stats.budget_remaining >= budget;
    };
    /**
     * Gets remaining total budget.
     */
    AgentPool.prototype.getRemainingBudget = function () {
        return this.config.total_budget - this.totalSpent;
    };
    /**
     * Sets the callback for agent start events.
     */
    AgentPool.prototype.onStart = function (callback) {
        this.onAgentStart = callback;
    };
    /**
     * Sets the callback for agent complete events.
     */
    AgentPool.prototype.onComplete = function (callback) {
        this.onAgentComplete = callback;
    };
    /**
     * Sets the callback for agent fail events.
     */
    AgentPool.prototype.onFail = function (callback) {
        this.onAgentFail = callback;
    };
    /**
     * Sets the callback for budget warning events.
     */
    AgentPool.prototype.onWarning = function (callback) {
        this.onBudgetWarning = callback;
    };
    /**
     * Sets the callback for budget exhausted events.
     */
    AgentPool.prototype.onExhausted = function (callback) {
        this.onBudgetExhausted = callback;
    };
    /**
     * Sets callback for sequential spawn detection warnings.
     */
    AgentPool.prototype.onSequentialSpawn = function (callback) {
        this.onSequentialSpawnDetected = callback;
    };
    /**
     * Gets the current configuration.
     */
    AgentPool.prototype.getConfig = function () {
        return __assign({}, this.config);
    };
    /**
     * Updates the configuration.
     */
    AgentPool.prototype.updateConfig = function (config) {
        this.config = __assign(__assign({}, this.config), config);
    };
    /**
     * Clears completed and failed agents from the pool.
     */
    AgentPool.prototype.prune = function () {
        var pruned = 0;
        for (var _i = 0, _a = this.agents.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], agent = _b[1];
            if (agent.status === "completed" || agent.status === "failed") {
                this.agents.delete(id);
                pruned++;
            }
        }
        return pruned;
    };
    return AgentPool;
}());
exports.AgentPool = AgentPool;
