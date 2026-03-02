import { NoteService } from './service.js';

const service = new NoteService();

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showHelp(): void {
  console.log(`
Note-taking CLI

Usage: notes <command> [options]

Commands:
  add <title> [--content "..."] [--tags "tag1,tag2"]   Create a note
  list                                                   List all notes
  view <id>                                              Show a full note
  edit <id> [--title "..."] [--content "..."] [--tags "..."]  Update a note
  rm <id>                                                Delete a note
  search <query>                                         Search notes
  tags                                                   List all tags
  help                                                   Show this help
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    showHelp();
    return;
  }

  try {
    switch (command) {
      case 'add': {
        const title = args[1];
        if (!title) {
          console.error('Error: title is required. Usage: notes add <title> [--content "..."] [--tags "tag1,tag2"]');
          process.exit(1);
        }
        const flags = parseFlags(args.slice(2));
        const note = await service.create({
          title,
          content: flags['content'] ?? '',
          tags: flags['tags'] ? flags['tags'].split(',').map(t => t.trim()) : [],
        });
        console.log(`Created note [${note.id}]: ${note.title}`);
        break;
      }

      case 'list': {
        const notes = await service.getAll();
        if (notes.length === 0) {
          console.log('No notes found.');
          break;
        }
        console.log('');
        for (const note of notes) {
          const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : '';
          console.log(`  ${note.id}  ${note.title}${tags}  (${formatDate(note.createdAt)})`);
        }
        console.log('');
        break;
      }

      case 'view': {
        const id = args[1];
        if (!id) {
          console.error('Error: id is required. Usage: notes view <id>');
          process.exit(1);
        }
        const note = await service.getById(id);
        if (!note) {
          console.error(`Error: Note '${id}' not found.`);
          process.exit(1);
        }
        console.log(`\nTitle:   ${note.title}`);
        console.log(`ID:      ${note.id}`);
        console.log(`Tags:    ${note.tags.length > 0 ? note.tags.join(', ') : '(none)'}`);
        console.log(`Created: ${formatDate(note.createdAt)}`);
        console.log(`Updated: ${formatDate(note.updatedAt)}`);
        console.log(`\n${note.content || '(no content)'}\n`);
        break;
      }

      case 'edit': {
        const id = args[1];
        if (!id) {
          console.error('Error: id is required. Usage: notes edit <id> [--title "..."] [--content "..."] [--tags "..."]');
          process.exit(1);
        }
        const flags = parseFlags(args.slice(2));
        const updates: Record<string, string | string[]> = {};
        if (flags['title']) updates['title'] = flags['title'];
        if (flags['content']) updates['content'] = flags['content'];
        if (flags['tags']) updates['tags'] = flags['tags'].split(',').map(t => t.trim());
        if (Object.keys(updates).length === 0) {
          console.error('Error: at least one of --title, --content, or --tags is required.');
          process.exit(1);
        }
        const note = await service.update(id, updates);
        if (!note) {
          console.error(`Error: Note '${id}' not found.`);
          process.exit(1);
        }
        console.log(`Updated note [${note.id}]: ${note.title}`);
        break;
      }

      case 'rm': {
        const id = args[1];
        if (!id) {
          console.error('Error: id is required. Usage: notes rm <id>');
          process.exit(1);
        }
        const deleted = await service.delete(id);
        if (!deleted) {
          console.error(`Error: Note '${id}' not found.`);
          process.exit(1);
        }
        console.log(`Deleted note [${id}].`);
        break;
      }

      case 'search': {
        const query = args[1];
        if (!query) {
          console.error('Error: query is required. Usage: notes search <query>');
          process.exit(1);
        }
        const notes = await service.search(query);
        if (notes.length === 0) {
          console.log(`No notes found matching '${query}'.`);
          break;
        }
        console.log(`\nFound ${notes.length} note(s) matching '${query}':\n`);
        for (const note of notes) {
          const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : '';
          console.log(`  ${note.id}  ${note.title}${tags}`);
        }
        console.log('');
        break;
      }

      case 'tags': {
        const tags = await service.listTags();
        if (tags.length === 0) {
          console.log('No tags found.');
          break;
        }
        console.log(`\nTags: ${tags.join(', ')}\n`);
        break;
      }

      default:
        console.error(`Unknown command: '${command}'. Run 'notes help' for usage.`);
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
