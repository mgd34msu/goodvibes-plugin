# Simple Task API

A lightweight REST API for managing tasks, built with Node.js and Express.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

The server starts on `http://localhost:3000`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /tasks | List all tasks |
| POST | /tasks | Create a new task |
| GET | /tasks/:id | Get a task by ID |
| PUT | /tasks/:id | Update a task by ID |
| DELETE | /tasks/:id | Delete a task by ID |

## Examples

**List all tasks**
```bash
curl http://localhost:3000/tasks
```

**Create a task**
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "status": "pending"}'
```

**Get a task**
```bash
curl http://localhost:3000/tasks/1
```

**Update a task**
```bash
curl -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

**Delete a task**
```bash
curl -X DELETE http://localhost:3000/tasks/1
```
