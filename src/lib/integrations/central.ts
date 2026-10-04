import { collection, query, where, getDocs, documentId } from "firebase/firestore";
import { db } from "../firebase";

/**
 * PHASE 10: Dynamic Synchronization (Read side)
 * Retrieves projects assigned to an employee via the Central Database.
 */
export async function getAssignedProjects(employeeId: string) {
  // 1. Get project memberships for the employee
  const membersQuery = query(
    collection(db, 'projectMembers'), 
    where('employeeId', '==', employeeId), 
    where('status', '==', 'ACTIVE')
  );
  const membersSnap = await getDocs(membersQuery);
  
  if (membersSnap.empty) return [];

  const projectIds = membersSnap.docs.map(doc => doc.data().projectId);

  // 2. Fetch the projects (Chunked by 30 to respect Firestore 'in' limits)
  const projects = [];
  for (let i = 0; i < projectIds.length; i += 30) {
    const chunk = projectIds.slice(i, i + 30);
    const pQuery = query(collection(db, 'projects'), where(documentId(), 'in', chunk));
    const pSnap = await getDocs(pQuery);
    projects.push(...pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }

  return projects;
}
