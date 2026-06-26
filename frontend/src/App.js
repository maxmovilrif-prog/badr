import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import ChatMaroc from "@/pages/ChatMaroc";
import SharedChat from "@/pages/SharedChat";

function App() {
  return (
    <div className="App font-body">
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ChatMaroc />} />
          <Route path="/share/:token" element={<SharedChat />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
