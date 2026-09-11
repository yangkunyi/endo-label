import { Route, Routes } from "react-router-dom";
import useSWR, { SWRConfig } from "swr";
import { AdminProjects } from "./AdminProjects";
import { AdminUsers } from "./AdminUsers";
import { AdminVocab } from "./AdminVocab";
import { AppShell } from "./AppShell";
import { AssignmentsBoard } from "./AssignmentsBoard";
import { ClipDesk } from "./ClipDesk";
import { Login } from "./Login";
import { MyTasks } from "./MyTasks";
import { getJson, mePath, type Me } from "./api";

/** An annotator's default page is My Tasks; everyone else lands on the desk. */
function Home() {
  const { data } = useSWR(mePath(), getJson<Me>);
  if (!data) {
    return <p className="p-6">Loading…</p>;
  }
  return data.capabilities?.annotate ? <MyTasks /> : <ClipDesk />;
}

export default function App() {
  return (
    <SWRConfig value={{ shouldRetryOnError: false }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/tasks" element={<MyTasks />} />
          <Route path="/clips/:clipId" element={<ClipDesk />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/projects" element={<AdminProjects />} />
          <Route path="/admin/vocab" element={<AdminVocab />} />
          <Route path="/admin/assignments" element={<AssignmentsBoard />} />
        </Route>
      </Routes>
    </SWRConfig>
  );
}
