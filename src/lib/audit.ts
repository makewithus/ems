import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function logAudit(
  actorId: string,
  actorName: string,
  actorRole: string,
  action: string,
  entityType: string,
  entityId: string,
  description: string
) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      timestamp: new Date().toISOString(),
      actorId,
      actorName: actorName || 'Unknown',
      actorRole: actorRole || 'EMPLOYEE',
      action,
      entityType,
      entityId,
      description,
      module: 'EMS'
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
