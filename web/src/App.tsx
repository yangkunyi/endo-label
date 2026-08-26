import { Route, Routes } from "react-router-dom";
import { SWRConfig } from "swr";
import { ClipDesk } from "./ClipDesk";

export default function App() {
  return (
    <SWRConfig value={{ shouldRetryOnError: false }}>
      <div className="min-h-screen bg-stone-100 text-stone-900">
        <Routes>
          <Route path="/" element={<ClipDesk />} />
          <Route path="/clips/:clipId" element={<ClipDesk />} />
        </Routes>
      </div>
    </SWRConfig>
  );
}
