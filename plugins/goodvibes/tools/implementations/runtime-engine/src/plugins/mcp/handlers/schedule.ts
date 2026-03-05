/**
 * Handler for the runtime_schedule MCP tool.
 *
 * Manages named interval schedules through the TimePlugin's EventScheduler.
 * Actions: list, create, cancel, get, pause, resume, heartbeat.
 *
 * Input schema: { action: string, schedule_id?: string, type?: string,
 *   event_type?: string, interval_ms?: number, delay_ms?: number,
 *   preset?: string, payload?: object, ttl?: number }
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage } from '../../../shared/utils.js';
import { resolveInterval } from '../../../shared/presets.js';
import type { HandlerContext } from './types.js';
import { toSuccess, toError } from './shared.js';

const logger = createLogger('tool-handlers:schedule');

const VALID_ACTIONS = ['list', 'create', 'cancel', 'get', 'pause', 'resume', 'heartbeat'] as const;
type ScheduleAction = typeof VALID_ACTIONS[number];

export const handleRuntimeSchedule = async (
  args: unknown,
  ctx: HandlerContext,
): Promise<CallToolResult> => {
  const start = Date.now();
  const version = ctx.version;
  const uptime = ctx.getUptime();

  const params = (args ?? {}) as Record<string, unknown>;
  const action = params.action as ScheduleAction | undefined;

  if (!action) {
    return toError('Missing required parameter: action', version, uptime, Date.now() - start);
  }
  if (!VALID_ACTIONS.includes(action)) {
    return toError(
      `Unknown action: ${action}. Valid: ${VALID_ACTIONS.join(', ')}`,
      version,
      uptime,
      Date.now() - start,
    );
  }

  const timePlugin = ctx.getTimePlugin?.();
  if (!timePlugin && !ctx.transport) {
    return toError(
      'TimePlugin is not available (engine may not be running in local mode)',
      version,
      uptime,
      Date.now() - start,
    );
  }
  const scheduler = timePlugin?.getScheduler();
  const heartbeat = timePlugin?.getHeartbeat();

  try {
    switch (action) {
      case 'list': {
        const filter = params.filter as { type?: string } | undefined;
        if (ctx.transport) {
          const items = await ctx.transport.listSchedules(filter);
          return toSuccess({ items, count: items.length }, version, uptime, Date.now() - start);
        }
        let items = scheduler!.getAllItems();
        if (filter?.type) {
          items = items.filter(item => item.time_type === filter.type);
        }
        return toSuccess(
          { items, count: items.length },
          version,
          uptime,
          Date.now() - start,
        );
      }

      case 'get': {
        const scheduleId = params.schedule_id as string | undefined;
        if (!scheduleId) {
          return toError(
            'Missing required parameter: schedule_id',
            version,
            uptime,
            Date.now() - start,
          );
        }
        if (ctx.transport) {
          const item = await ctx.transport.getSchedule(scheduleId);
          if (!item) {
            return toError(`Schedule not found: ${scheduleId}`, version, uptime, Date.now() - start);
          }
          return toSuccess({ item }, version, uptime, Date.now() - start);
        }
        const item = scheduler!.getItem(scheduleId);
        if (!item) {
          return toError(
            `Schedule not found: ${scheduleId}`,
            version,
            uptime,
            Date.now() - start,
          );
        }
        return toSuccess({ item }, version, uptime, Date.now() - start);
      }

      case 'create': {
        const scheduleId = params.schedule_id as string | undefined;
        const eventType = params.event_type as string | undefined;
        const scheduleType = (params.type as string | undefined) ?? 'heartbeat';
        const payloadRaw = params.payload as Record<string, unknown> | undefined;
        const ttl = params.ttl as number | undefined;

        if (!scheduleId) {
          return toError(
            'Missing required parameter: schedule_id',
            version,
            uptime,
            Date.now() - start,
          );
        }
        if (!eventType) {
          return toError(
            'Missing required parameter: event_type',
            version,
            uptime,
            Date.now() - start,
          );
        }

        // Resolve interval from preset or raw ms
        const presetOrMs = params.preset ?? params.interval_ms;
        const delayMs = params.delay_ms as number | undefined;

        if (ctx.transport) {
          // Validate and resolve interval before delegating to transport
          let resolvedIntervalMs: number | undefined;
          if (scheduleType !== 'one_shot') {
            if (presetOrMs === undefined) {
              return toError(
                'Missing required parameter: interval_ms or preset',
                version,
                uptime,
                Date.now() - start,
              );
            }
            try {
              resolvedIntervalMs = resolveInterval(presetOrMs as string | number);
            } catch (err) {
              return toError(toErrorMessage(err), version, uptime, Date.now() - start);
            }
          } else if (delayMs === undefined) {
            return toError(
              'Missing required parameter: delay_ms (required for one_shot type)',
              version,
              uptime,
              Date.now() - start,
            );
          }
          const created = await ctx.transport.createSchedule({
            schedule_id: scheduleId,
            event_type: eventType,
            schedule_type: scheduleType,
            interval_ms: resolvedIntervalMs,
            delay_ms: delayMs,
            ttl,
            payload: payloadRaw,
          });
          logger.info('runtime_schedule: created via transport', { id: scheduleId, type: scheduleType });
          return toSuccess({ created }, version, uptime, Date.now() - start);
        }

        let item;
        if (scheduleType === 'one_shot') {
          if (delayMs === undefined) {
            return toError(
              'Missing required parameter: delay_ms (required for one_shot type)',
              version,
              uptime,
              Date.now() - start,
            );
          }
          item = scheduler!.scheduleOneShot({
            id: scheduleId,
            event_type: eventType,
            delay_ms: delayMs,
            ...(payloadRaw !== undefined && { payload: payloadRaw }),
          });
        } else if (scheduleType === 'cron') {
          if (presetOrMs === undefined) {
            return toError(
              'Missing required parameter: interval_ms or preset',
              version,
              uptime,
              Date.now() - start,
            );
          }
          let intervalMs: number;
          try {
            intervalMs = resolveInterval(presetOrMs as string | number);
          } catch (err) {
            return toError(toErrorMessage(err), version, uptime, Date.now() - start);
          }
          item = scheduler!.scheduleCron({
            id: scheduleId,
            event_type: eventType,
            interval_ms: intervalMs,
            ...(payloadRaw !== undefined && { payload: payloadRaw }),
          });
        } else {
          // Default: heartbeat
          if (presetOrMs === undefined) {
            return toError(
              'Missing required parameter: interval_ms or preset',
              version,
              uptime,
              Date.now() - start,
            );
          }
          let intervalMs: number;
          try {
            intervalMs = resolveInterval(presetOrMs as string | number);
          } catch (err) {
            return toError(toErrorMessage(err), version, uptime, Date.now() - start);
          }
          item = scheduler!.scheduleHeartbeat({
            id: scheduleId,
            event_type: eventType,
            interval_ms: intervalMs,
            ...(ttl !== undefined && { ttl }),
            ...(payloadRaw !== undefined && { payload: payloadRaw }),
          });
        }

        logger.info('runtime_schedule: created', { id: scheduleId, type: scheduleType });
        return toSuccess({ created: item }, version, uptime, Date.now() - start);
      }

      case 'cancel': {
        const scheduleId = params.schedule_id as string | undefined;
        if (!scheduleId) {
          return toError(
            'Missing required parameter: schedule_id',
            version,
            uptime,
            Date.now() - start,
          );
        }
        if (ctx.transport) {
          const cancelled = await ctx.transport.cancelSchedule(scheduleId);
          return toSuccess({ cancelled, schedule_id: scheduleId }, version, uptime, Date.now() - start);
        }
        const cancelled = scheduler!.cancel(scheduleId);
        return toSuccess(
          { cancelled, schedule_id: scheduleId },
          version,
          uptime,
          Date.now() - start,
        );
      }

      case 'pause': {
        const scheduleId = params.schedule_id as string | undefined;
        if (scheduleId) {
          if (ctx.transport) {
            const paused = await ctx.transport.pauseSchedule(scheduleId);
            if (!paused) {
              return toError(`Schedule not found: ${scheduleId}`, version, uptime, Date.now() - start);
            }
            return toSuccess({ paused: true, schedule_id: scheduleId }, version, uptime, Date.now() - start);
          }
          const paused = scheduler!.pause(scheduleId);
          if (!paused) {
            return toError(
              `Schedule not found: ${scheduleId}`,
              version,
              uptime,
              Date.now() - start,
            );
          }
          return toSuccess(
            { paused: true, schedule_id: scheduleId },
            version,
            uptime,
            Date.now() - start,
          );
        }
        if (ctx.transport) {
          await ctx.transport.pauseHeartbeat();
        } else {
          heartbeat!.disable();
        }
        return toSuccess(
          { paused: true, target: 'heartbeat' },
          version,
          uptime,
          Date.now() - start,
        );
      }

      case 'resume': {
        const scheduleId = params.schedule_id as string | undefined;
        if (scheduleId) {
          if (ctx.transport) {
            const resumed = await ctx.transport.resumeSchedule(scheduleId);
            if (!resumed) {
              return toError(`Schedule not found: ${scheduleId}`, version, uptime, Date.now() - start);
            }
            return toSuccess({ resumed: true, schedule_id: scheduleId }, version, uptime, Date.now() - start);
          }
          const resumed = scheduler!.resume(scheduleId);
          if (!resumed) {
            return toError(
              `Schedule not found: ${scheduleId}`,
              version,
              uptime,
              Date.now() - start,
            );
          }
          return toSuccess(
            { resumed: true, schedule_id: scheduleId },
            version,
            uptime,
            Date.now() - start,
          );
        }
        if (ctx.transport) {
          await ctx.transport.resumeHeartbeat();
        } else {
          heartbeat!.enable();
        }
        return toSuccess(
          { resumed: true, target: 'heartbeat' },
          version,
          uptime,
          Date.now() - start,
        );
      }

      case 'heartbeat': {
        const subAction = params.sub_action as string | undefined;

        if (subAction === 'set_interval') {
          const intervalMs = params.interval_ms as number | undefined;
          if (intervalMs == null || intervalMs < 1000) {
            return toError(
              'interval_ms must be a number >= 1000 (minimum 1 second to prevent excessive CPU usage)',
              version,
              uptime,
              Date.now() - start,
            );
          }
          if (ctx.transport) {
            await ctx.transport.setHeartbeatInterval(intervalMs);
          } else {
            heartbeat!.setInterval(intervalMs);
          }
          logger.info('runtime_schedule: heartbeat interval updated', { interval_ms: intervalMs });
          return toSuccess(
            { action: 'heartbeat', sub_action: 'set_interval', interval_ms: intervalMs },
            version,
            uptime,
            Date.now() - start,
          );
        }

        // Default: return current heartbeat status
        if (ctx.transport) {
          const hbStatus = await ctx.transport.getHeartbeat();
          return toSuccess(hbStatus, version, uptime, Date.now() - start);
        }
        return toSuccess(
          {
            enabled: heartbeat!.isEnabled(),
            tick_count: heartbeat!.getTickCount(),
            last_tick_at: heartbeat!.getLastTickAt(),
            scheduled_count: scheduler!.size(),
            interval_ms: heartbeat!.getInterval(),
          },
          version,
          uptime,
          Date.now() - start,
        );
      }
    }
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error('runtime_schedule failed', { action, error: message });
    return toError(message, version, uptime, Date.now() - start);
  }
}
