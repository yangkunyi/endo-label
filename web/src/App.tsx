import { Route, Routes } from "react-router-dom";
import { SWRConfig } from "swr";
import { AppShell } from "./AppShell";
import { AssignmentsBoard } from "./AssignmentsBoard";
import { ClipDesk } from "./ClipDesk";
import { Login } from "./Login";

export default function App() {
  return (
    <SWRConfig value={{ shouldRetryOnError: false }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<ClipDesk />} />
          <Route path="/clips/:clipId" element={<ClipDesk />} />
          <Route path="/admin/assignments" element={<AssignmentsBoard />} />
        </Route>
      </Routes>
    </SWRConfig>
  );
}
