"use strict";
// Simulated bundle output for bundle_analyze
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");

// --- types.ts ---
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
function formatTimestamp(date) { return date.toISOString(); }
class EventEmitterHelper {
    constructor() { this.handlers = new Map(); }
    on(event, handler) { const e = this.handlers.get(event) || []; e.push(handler); this.handlers.set(event, e); }
    emit(event, ...args) { (this.handlers.get(event) || []).forEach(h => h(...args)); }
}

// --- utils.ts ---
function validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function paginate(items, page, pageSize = DEFAULT_PAGE_SIZE) {
    const s = Math.min(pageSize, MAX_PAGE_SIZE);
    const start = (page - 1) * s;
    return items.slice(start, start + s);
}
function hashPassword(password) { return Buffer.from(password).toString('base64'); }
function formatUser(user) { return `${user.name || 'Anonymous'} <${user.email}>`; }
function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    if (today.getMonth() - birthDate.getMonth() < 0) age--;
    return age;
}
function slugify(text) { return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, ''); }
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- api/routes.ts ---
function createApp() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.get('/api/users', (_req, res) => res.json({ success: true, data: [] }));
    app.post('/api/users', (req, res) => {
        const schema = zod_1.z.object({ email: zod_1.z.string().email(), name: zod_1.z.string().optional(), password: zod_1.z.string().min(8) });
        const result = schema.safeParse(req.body);
        if (!result.success) return res.status(400).json({ success: false, error: result.error.message });
        res.status(201).json({ success: true, data: { id: 1, ...result.data } });
    });
    app.get('/api/users/:id', (req, res) => res.json({ success: true, data: null }));
    app.delete('/api/users/:id', (_req, res) => res.status(204).send());
    app.get('/api/posts', (_req, res) => res.json({ success: true, data: [] }));
    app.post('/api/posts', (req, res) => res.status(201).json({ success: true, data: req.body }));
    app.put('/api/posts/:id', (req, res) => res.json({ success: true, data: req.body }));
    app.delete('/api/posts/:id', (_req, res) => res.status(204).send());
    app.get('/api/posts/:id/comments', (_req, res) => res.json({ success: true, data: [] }));
    app.post('/api/posts/:id/comments', (req, res) => res.status(201).json({ success: true, data: req.body }));
    return app;
}

// --- services ---
class UserService {
    constructor(dataDir = './data') { this.dataDir = dataDir; }
    loadUsers() { const p = (0, path_1.join)(this.dataDir, 'users.json'); if (!(0, fs_1.existsSync)(p)) return []; return JSON.parse((0, fs_1.readFileSync)(p, 'utf-8')); }
    saveUsers(users) { (0, fs_1.writeFileSync)((0, path_1.join)(this.dataDir, 'users.json'), JSON.stringify(users, null, 2)); }
}

class AuthService {
    constructor() { this.secret = 'my-super-secret-jwt-key-2024'; }
    sign(payload) {
        const h = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
        const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const s = (0, crypto_1.createHmac)('sha256', this.secret).update(`${h}.${b}`).digest('base64url');
        return `${h}.${b}.${s}`;
    }
}

// --- profile-target.ts ---
function fibonacci(n) { if (n <= 1) return n; return fibonacci(n - 1) + fibonacci(n - 2); }
function sortArray(arr) {
    const r = [...arr];
    for (let i = 0; i < r.length; i++) for (let j = 0; j < r.length - i - 1; j++) if (r[j] > r[j + 1]) [r[j], r[j + 1]] = [r[j + 1], r[j]];
    return r;
}
async function processData(items) {
    const results = [];
    for (const item of items) { await new Promise(r => setTimeout(r, 1)); results.push(item.trim().toLowerCase()); }
    return results;
}

// Exports
exports.createApp = createApp;
exports.validateEmail = validateEmail;
exports.paginate = paginate;
exports.hashPassword = hashPassword;
exports.formatUser = formatUser;
exports.fibonacci = fibonacci;
exports.sortArray = sortArray;
exports.processData = processData;
exports.UserService = UserService;
exports.AuthService = AuthService;
exports.sleep = sleep;
exports.MAX_PAGE_SIZE = MAX_PAGE_SIZE;
exports.DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;
exports.calculateAge = calculateAge;
exports.slugify = slugify;
exports.deepClone = deepClone;
exports.formatTimestamp = formatTimestamp;
exports.EventEmitterHelper = EventEmitterHelper;
