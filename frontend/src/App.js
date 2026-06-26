import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import ChatMaroc from "@/pages/ChatMaroc";

function App() {
  return (
    <div className="App font-body">
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ChatMaroc />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
