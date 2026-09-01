import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/index.js';
import { AttendanceEngine, MobilePunchInput } from '../attendance/attendance.engine.js';
import { AuditService } from '../audit/audit.service.js';

export interface OfflineSyncPayload {
  clientId: string;
  sourceType: 'MOBILE_APP' | 'EDGE_CONNECTOR';
  events: MobilePunchInput[];
}

export interface SyncBatchResult {
  syncId: string;
  totalReceived: number;
  successfullyProcessed: number;
  duplicatesSkipped: number;
  failedCount: number;
  details: {
    clientEventId?: string;
    status: 'SYNCED' | 'ALREADY_EXISTS' | 'FAILED';
    eventId?: string;
    error?: string;
  }[];
}

export class OfflineSyncService {
  /**
   * Ingests a batch of offline recorded attendance events
   */
  public static processSyncBatch(
    orgId: string,
    actorUserId: string,
    payload: OfflineSyncPayload
  ): SyncBatchResult {
    const syncId = uuidv4();
    const now = new Date().toISOString();
    let successCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    const details: SyncBatchResult['details'] = [];

    // Sort events by timestamp to ensure chronological playback
    const sortedEvents = [...payload.events].sort((a, b) => {
      const tA = new Date(a.timestamp || now).getTime();
      const tB = new Date(b.timestamp || now).getTime();
      return tA - tB;
    });

    for (const evt of sortedEvents) {
      try {
        const result = AttendanceEngine.processMobilePunch({
          ...evt,
          organizationId: orgId
        });

        if (result.message === 'Event already processed') {
          duplicateCount++;
          details.push({
            clientEventId: evt.clientEventId,
            status: 'ALREADY_EXISTS',
            eventId: result.event.id
          });
        } else {
          successCount++;
          details.push({
            clientEventId: evt.clientEventId,
            status: 'SYNCED',
            eventId: result.event.id
          });
        }
      } catch (err: any) {
        failedCount++;
        details.push({
          clientEventId: evt.clientEventId,
          status: 'FAILED',
          error: err.message || 'Unknown processing error'
        });
      }
    }

    // Record in synchronization_events table
    db.execute(`
      INSERT INTO synchronization_events (
        id, organization_id, device_or_client_id, source_type, events_count, status, details, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      syncId,
      orgId,
      payload.clientId,
      payload.sourceType,
      payload.events.length,
      failedCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL_FAILURE' : 'FAILED'),
      JSON.stringify(details),
      now
    ]);

    AuditService.log({
      organizationId: orgId,
      actorUserId,
      action: 'SYNC.OFFLINE_BATCH',
      entityType: 'synchronization_events',
      entityId: syncId,
      afterState: { processed: successCount, duplicates: duplicateCount, failed: failedCount }
    });

    return {
      syncId,
      totalReceived: payload.events.length,
      successfullyProcessed: successCount,
      duplicatesSkipped: duplicateCount,
      failedCount,
      details
    };
  }
}
