import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDycnVYG0dUoSYu5KYWwv1ZP0cDX_bvldQ",
  authDomain: "mwu-ms.firebaseapp.com",
  projectId: "mwu-ms",
  storageBucket: "mwu-ms.firebasestorage.app",
  messagingSenderId: "458872225232",
  appId: "1:458872225232:web:83c67341afdc64feb14dd5",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  console.log("=== INSPECTING FIRESTORE DATA ===");

  // 1. Check Employees (A-03, A-04, A-05, A-29)
  const empSnap = await getDocs(collection(db, "employees"));
  console.log(`Total employees in 'employees' collection: ${empSnap.size}`);
  
  const employees = [];
  empSnap.forEach((d) => {
    const data = d.data();
    employees.push({
      id: d.id,
      employeeId: data.employeeId,
      name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      status: data.status,
      designation: data.designation,
      salaryDate: data.salaryDate,
      email: data.email
    });
  });
  console.log("Employees list:", JSON.stringify(employees, null, 2));

  // 2. Check payroll/EMP1011_2026_10 (A-17, E-13, E-14)
  const payDoc = await getDoc(doc(db, "payroll", "EMP1011_2026_10"));
  console.log("payroll/EMP1011_2026_10 exists:", payDoc.exists());
  if (payDoc.exists()) {
    console.log("payroll data:", JSON.stringify(payDoc.data(), null, 2));
  }

  // 3. Check documents/payslip_EMP1011_2026_10 (A-19)
  const docSnap = await getDoc(doc(db, "documents", "payslip_EMP1011_2026_10"));
  console.log("documents/payslip_EMP1011_2026_10 exists:", docSnap.exists());
  if (docSnap.exists()) {
    console.log("document data:", JSON.stringify(docSnap.data(), null, 2));
  }

  // 4. Check settings/company (A-20)
  const compDoc = await getDoc(doc(db, "settings", "company"));
  console.log("settings/company exists:", compDoc.exists());
  if (compDoc.exists()) {
    console.log("company data:", JSON.stringify(compDoc.data(), null, 2));
  }

  // 5. Check settings/categories (A-26)
  const catDoc = await getDoc(doc(db, "settings", "categories"));
  console.log("settings/categories exists:", catDoc.exists());
  if (catDoc.exists()) {
    console.log("categories data:", JSON.stringify(catDoc.data(), null, 2));
  }

  // 6. Check tasks (A-12, A-13, A-21)
  const taskSnap = await getDocs(collection(db, "tasks"));
  console.log(`Total tasks: ${taskSnap.size}`);
  let underReviewCount = 0;
  let completedCount = 0;
  taskSnap.forEach((d) => {
    const t = d.data();
    if (t.status === "under_review" || t.status === "Under Review") underReviewCount++;
    if (t.status === "completed" || t.status === "Completed") completedCount++;
  });
  console.log(`Tasks under review: ${underReviewCount}, Completed: ${completedCount}`);

  process.exit(0);
}

inspect().catch((err) => {
  console.error("Error inspecting:", err);
  process.exit(1);
});

