using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

class OkashaBridgeLauncher : ApplicationContext {
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    readonly string directory;
    readonly object logLock = new object();
    readonly NotifyIcon tray;
    readonly Icon appIcon;
    readonly System.Windows.Forms.Timer timer;
    readonly BridgeStatusWindow statusWindow;
    readonly ToolStripMenuItem hardwareItem, whatsappItem;
    readonly EventWaitHandle showEvent, exitEvent;
    readonly int hardwarePort, whatsappPort;
    readonly ChildJob job = new ChildJob();
    Process hardware, whatsapp;
    int hardwareFailures, whatsappFailures, ticks;
    bool stopping, checking;
    string hardwareStatus = "Starting...", whatsappStatus = "Starting...";

    static string DataDirectory() {
        return Path.GetFullPath(Environment.GetEnvironmentVariable("INSTITUTE_BRIDGE_DATA_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OkashaInstitute", "Bridge"));
    }
    static string InstanceName() {
        // Isolated packaging checks never signal the reception instance.
        using (var hash = SHA256.Create()) {
            return "Local\\OkashaBridgePlatform-" + BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(DataDirectory().TrimEnd('\\').ToUpperInvariant()))).Replace("-", "").Substring(0, 20);
        }
    }
    [STAThread]
    static int Main(string[] args) {
        string name = InstanceName();
        if (Array.IndexOf(args, "--exit") >= 0) {
            try { using (var signal = EventWaitHandle.OpenExisting(name + "-exit")) signal.Set(); return 0; }
            catch (WaitHandleCannotBeOpenedException) { return 0; }
        }
        bool first;
        using (var instance = new Mutex(true, name, out first)) {
            if (!first) {
                if (Array.IndexOf(args, "--background") < 0) try { using (var signal = EventWaitHandle.OpenExisting(name + "-show")) signal.Set(); } catch (WaitHandleCannotBeOpenedException) { }
                return 0;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try { Application.Run(new OkashaBridgeLauncher(name, Array.IndexOf(args, "--background") >= 0)); return 0; }
            catch (Exception error) { MessageBox.Show(error.Message, "Okasha Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
            finally { instance.ReleaseMutex(); }
        }
    }
    static int Port(string variable, int fallback) {
        int value; string raw = Environment.GetEnvironmentVariable(variable);
        if (String.IsNullOrEmpty(raw)) return fallback;
        if (!Int32.TryParse(raw, out value) || value < 1 || value > 65535) throw new Exception(variable + " must be a valid local port.");
        return value;
    }
    OkashaBridgeLauncher(string name, bool background) {
        directory = DataDirectory();
        hardwarePort = Port("BRIDGE_PORT", 14318); whatsappPort = Port("WHATSAPP_BRIDGE_PORT", 14320);
        if (hardwarePort == whatsappPort || PortInUse(hardwarePort) || PortInUse(whatsappPort))
            throw new Exception("A Bridge or another program already uses a required local port (" + hardwarePort + " / " + whatsappPort + "). Close the existing Bridge before starting this installation. No device or account data was changed.");
        Directory.CreateDirectory(Path.Combine(directory, "logs"));
        string tokenPath = Path.Combine(directory, "bridge.token");
        if (!File.Exists(tokenPath)) { byte[] secret = new byte[32]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(secret); File.WriteAllText(tokenPath, BitConverter.ToString(secret).Replace("-", "").ToLowerInvariant()); }
        showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, name + "-show");
        exitEvent = new EventWaitHandle(false, EventResetMode.AutoReset, name + "-exit");
        appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        statusWindow = new BridgeStatusWindow(appIcon);
        statusWindow.FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (e.CloseReason == CloseReason.UserClosing && !stopping) { e.Cancel = true; statusWindow.Hide(); }
            else if (!stopping) ExitThread();
        };
        // Keep a dispatcher handle even while the status window is hidden at sign-in.
        IntPtr handle = statusWindow.Handle;
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Bridge status", null, delegate { ShowStatus(); });
        menu.Items.Add("Open Okasha", null, delegate { OpenLink("http://127.0.0.1:3000/settings"); });
        menu.Items.Add(new ToolStripSeparator());
        hardwareItem = new ToolStripMenuItem("Hardware: starting...") { Enabled = false };
        whatsappItem = new ToolStripMenuItem("WhatsApp: starting...") { Enabled = false };
        menu.Items.Add(hardwareItem); menu.Items.Add(whatsappItem);
        menu.Items.Add("Retry stopped adapters", null, delegate { RetryStopped(); });
        menu.Items.Add("Open logs", null, delegate { OpenLogs(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Version " + Application.ProductVersion) { Enabled = false });
        menu.Items.Add("Exit Bridge", null, delegate { ExitThread(); });
        statusWindow.MoreRequested += delegate { statusWindow.OpenMenu(menu); };
        tray = new NotifyIcon { Text = "Okasha Bridge - starting", Icon = appIcon, ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += delegate { ShowStatus(); };
        timer = new System.Windows.Forms.Timer { Interval = 1000 };
        timer.Tick += delegate {
            if (stopping) return;
            if (exitEvent.WaitOne(0)) { ExitThread(); return; }
            if (showEvent.WaitOne(0)) ShowStatus();
            if (++ticks % 5 == 0) { Supervise(); CheckHealth(); }
        };
        hardware = TryStart("hardware"); whatsapp = TryStart("whatsapp");
        RenderStatus(); timer.Start(); CheckHealth();
        if (!background) ShowStatus();
        Log("launcher", "Started " + Application.ProductVersion + "; notification tray active.");
    }
    bool PortInUse(int port) {
        try { using (var client = new System.Net.Sockets.TcpClient()) { var task = client.ConnectAsync("127.0.0.1", port); return task.Wait(300) && client.Connected; } } catch { return false; }
    }
    bool Alive(Process process) { try { return process != null && !process.HasExited; } catch { return false; } }
    Process TryStart(string name) {
        try {
            int port = name == "hardware" ? hardwarePort : whatsappPort;
            if (PortInUse(port)) throw new Exception("Local port " + port + " is already occupied. The existing listener was left untouched.");
            string executable = name == "hardware" ? "OkashaHardware.exe" : Path.Combine("runtime", "node.exe");
            string arguments = name == "hardware" ? "serve" : "\"" + Path.Combine(root, "scripts", "raw-bridge.mjs") + "\"";
            var info = new ProcessStartInfo(Path.Combine(root, executable), arguments) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = root, RedirectStandardError = true, RedirectStandardOutput = true };
            info.EnvironmentVariables["INSTITUTE_BRIDGE_DATA_DIR"] = directory;
            info.EnvironmentVariables["LOCAL_BRIDGE_TOKEN"] = File.ReadAllText(Path.Combine(directory, "bridge.token")).Trim();
            info.EnvironmentVariables["BRIDGE_WHATSAPP_SOURCE"] = Path.Combine(root, "whatsapp", "src");
            info.EnvironmentVariables["WHATSAPP_DATA_DIR"] = Path.Combine(Path.GetDirectoryName(directory), "WhatsApp");
            info.EnvironmentVariables["LOCAL_BRIDGE_URL"] = "http://127.0.0.1:" + whatsappPort;
            info.EnvironmentVariables["BRIDGE_HOST"] = "127.0.0.1";
            info.EnvironmentVariables["BRIDGE_PORT"] = hardwarePort.ToString();
            info.EnvironmentVariables["WHATSAPP_BRIDGE_PORT"] = whatsappPort.ToString();
            info.EnvironmentVariables["NODE_NO_WARNINGS"] = "1";
            var process = new Process { StartInfo = info };
            DataReceivedEventHandler logger = delegate(object sender, DataReceivedEventArgs e) { if (!String.IsNullOrEmpty(e.Data)) Log(name, e.Data); };
            process.ErrorDataReceived += logger; process.OutputDataReceived += logger;
            process.Start();
            try { job.Add(process); } catch { StopProcess(process); throw; }
            process.BeginErrorReadLine(); process.BeginOutputReadLine();
            Log("launcher", name + " process started (PID " + process.Id + ").");
            return process;
        } catch (Exception error) { Log("launcher", name + " could not start: " + error.Message); return null; }
    }
    void Supervise() {
        if (!Alive(hardware) && hardwareFailures < 3) { hardwareFailures++; if (hardware != null) hardware.Dispose(); hardware = TryStart("hardware"); }
        if (!Alive(whatsapp) && whatsappFailures < 3) { whatsappFailures++; if (whatsapp != null) whatsapp.Dispose(); whatsapp = TryStart("whatsapp"); }
    }
    void RetryStopped() {
        if (!Alive(hardware)) hardwareFailures = 0;
        if (!Alive(whatsapp)) whatsappFailures = 0;
        Supervise(); CheckHealth();
    }
    static bool Health(int port) {
        try {
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/health");
            request.Proxy = null; request.Timeout = 1500; request.ReadWriteTimeout = 1500;
            using (var response = request.GetResponse()) using (var reader = new StreamReader(response.GetResponseStream())) {
                string body = reader.ReadToEnd();
                return body.Contains("\"status\":\"ok\"") || body.Contains("\"status\": \"ok\"");
            }
        } catch { return false; }
    }
    void CheckHealth() {
        if (checking || stopping) return;
        checking = true;
        // Only local adapter liveness, never device I/O or WhatsApp/cloud requests.
        Task.Run(delegate {
            bool h = Health(hardwarePort), w = Health(whatsappPort);
            try { statusWindow.BeginInvoke((Action)delegate {
                checking = false; if (stopping) return;
                hardwareStatus = Alive(hardware) ? (h ? "Ready" : "Starting / not responding") : "Stopped - see logs";
                whatsappStatus = Alive(whatsapp) ? (w ? "Ready" : "Starting / not responding") : "Stopped - see logs";
                RenderStatus();
            }); } catch (InvalidOperationException) { }
        });
    }
    void RenderStatus() {
        hardwareItem.Text = "Hardware adapter: " + hardwareStatus;
        whatsappItem.Text = "WhatsApp adapter: " + whatsappStatus;
        statusWindow.SetAdapterStates(hardwareStatus, whatsappStatus);
        bool ready = hardwareStatus == "Ready" && whatsappStatus == "Ready";
        tray.Text = ready ? "Okasha Bridge - adapters ready" : "Okasha Bridge - check status";
    }
    void ShowStatus() { statusWindow.Show(); statusWindow.WindowState = FormWindowState.Normal; statusWindow.Activate(); }
    void OpenLink(string target) { try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); } catch (Exception error) { MessageBox.Show(error.Message, "Okasha Bridge"); } }
    void OpenLogs() { OpenLink(Path.Combine(directory, "logs")); }
    void Log(string name, string message) {
        try { lock (logLock) {
            string file = Path.Combine(directory, "logs", name + ".log");
            if (File.Exists(file) && new FileInfo(file).Length > 2097152) { File.Copy(file, file + ".1", true); File.WriteAllText(file, ""); }
            File.AppendAllText(file, DateTime.UtcNow.ToString("o") + " " + message + Environment.NewLine);
        } } catch { }
    }
    static void StopProcess(Process process) {
        try {
            if (process != null && !process.HasExited) {
                var info = new ProcessStartInfo("taskkill.exe", "/PID " + process.Id + " /T /F") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
                using (var kill = Process.Start(info)) kill.WaitForExit(5000);
            }
        } catch { }
    }
    protected override void ExitThreadCore() {
        if (stopping) return;
        stopping = true; timer.Stop(); timer.Dispose();
        tray.Visible = false; tray.ContextMenuStrip.Dispose(); tray.Dispose();
        // Closing the job ends only this launcher's processes, including PyInstaller children.
        // Durable receipts retain interrupted operations as uncertain on the next launch.
        job.Dispose();
        foreach (var process in new[] { hardware, whatsapp }) if (process != null) { StopProcess(process); process.Dispose(); }
        Log("launcher", "Stopped; device configuration and WhatsApp session retained.");
        showEvent.Dispose(); exitEvent.Dispose(); statusWindow.Dispose(); appIcon.Dispose(); base.ExitThreadCore();
    }
}

// A Windows job prevents orphan adapters after a launcher crash or Windows sign-out.
sealed class ChildJob : IDisposable {
    IntPtr handle;
    [StructLayout(LayoutKind.Sequential)] struct Limits { public long UserTime, JobTime; public uint Flags; public UIntPtr MinWorking, MaxWorking; public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct Extended { public Limits Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int kind, ref Extended info, uint length);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr value);
    public ChildJob() {
        handle = CreateJobObject(IntPtr.Zero, null);
        var limits = new Extended(); limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (handle == IntPtr.Zero || !SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(limits))) { Dispose(); throw new Exception("Windows could not create the Bridge process supervisor."); }
    }
    public void Add(Process process) { if (!AssignProcessToJobObject(handle, process.Handle)) throw new Exception("Windows could not supervise the adapter process."); }
    public void Dispose() { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
}
