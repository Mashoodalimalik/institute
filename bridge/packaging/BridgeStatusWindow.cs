using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

// Design 03: the coordinates and colours match the approved 460 x 300 mockup.
sealed class BridgeStatusWindow : Form {
    readonly Label hardwareState, whatsappState, summary;
    readonly StatusDot hardwareDot, whatsappDot;
    readonly BridgeButton more;
    readonly ToolTip tips = new ToolTip();
    readonly Image logo;
    public event EventHandler MoreRequested;

    static readonly Color Background = Color.FromArgb(21, 23, 28);
    static readonly Color Tile = Color.FromArgb(32, 36, 43);
    static Color Hex(int rgb) { return Color.FromArgb((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255); }
    static Font PixelFont(float size, FontStyle style) { return new Font(style == FontStyle.Bold ? "Segoe UI Semibold" : "Segoe UI", size, FontStyle.Regular, GraphicsUnit.Pixel); }
    static Label TextLabel(string text, int x, int y, int width, int height, int size, int color, FontStyle style) {
        return new BridgeLabel { Text = text, Location = new Point(x, y), Size = new Size(width, height), Font = PixelFont(size, style), ForeColor = Hex(color), BackColor = Color.Transparent, UseCompatibleTextRendering = false, AutoSize = false, TextAlign = ContentAlignment.MiddleLeft };
    }
    public BridgeStatusWindow(Icon icon) {
        Text = "Okasha Bridge"; Icon = icon; logo = icon.ToBitmap();
        AutoScaleDimensions = new SizeF(96, 96); AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(460, 300); FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen; MaximizeBox = false;
        BackColor = Background; ForeColor = Color.White; DoubleBuffered = true;
        KeyPreview = true;
        AccessibleName = "Okasha Bridge status";

        // Labels are real accessible controls, not text baked into a background image.
        var title = TextLabel("Okasha Bridge", 40, 7, 260, 23, 11, 0xcdd2d9, FontStyle.Regular);
        title.BackColor = Hex(0x22262c);
        title.MouseDown += delegate(object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) BeginDrag(); };
        Controls.Add(title);
        Controls.Add(TextLabel("Okasha Bridge", 73, 56, 290, 32, 18, 0xf4f6f8, FontStyle.Bold));
        var minimize = new BridgeButton("", new Rectangle(360, 0, 45, 35), Hex(0x22262c), Hex(0xa3aab3), "minimize");
        minimize.AccessibleName = "Minimize"; minimize.Click += delegate { WindowState = FormWindowState.Minimized; };
        var close = new BridgeButton("", new Rectangle(415, 0, 45, 35), Hex(0x22262c), Hex(0xa3aab3), "close");
        close.AccessibleName = "Close to tray"; close.Click += delegate { Close(); };
        tips.SetToolTip(close, "Close to notification tray");
        more = new BridgeButton("", new Rectangle(408, 56, 34, 34), Background, Hex(0x9aa1ae), "more");
        more.AccessibleName = "More options"; more.Click += delegate { if (MoreRequested != null) MoreRequested(this, EventArgs.Empty); };
        tips.SetToolTip(more, "Logs, retry, version and exit");
        var hardware = new StatusTile(new Rectangle(28, 114, 194, 111), Tile, "hardware");
        var whatsapp = new StatusTile(new Rectangle(236, 114, 196, 111), Tile, "whatsapp");
        hardware.AccessibleName = "Hardware adapter"; whatsapp.AccessibleName = "WhatsApp adapter";
        hardware.Controls.Add(TextLabel("Hardware", 17, 53, 165, 27, 15, 0xf6f7f9, FontStyle.Regular));
        whatsapp.Controls.Add(TextLabel("WhatsApp", 18, 53, 165, 27, 15, 0xf6f7f9, FontStyle.Regular));
        hardwareState = TextLabel("Starting", 32, 81, 151, 23, 12, 0x9eaab7, FontStyle.Regular);
        whatsappState = TextLabel("Starting", 33, 81, 151, 23, 12, 0x9eaab7, FontStyle.Regular);
        hardwareDot = new StatusDot(new Point(17, 87)); whatsappDot = new StatusDot(new Point(18, 87));
        hardware.Controls.Add(hardwareState); hardware.Controls.Add(hardwareDot);
        whatsapp.Controls.Add(whatsappState); whatsapp.Controls.Add(whatsappDot);
        summary = TextLabel("Starting adapters", 28, 251, 300, 33, 12, 0x94a0ad, FontStyle.Regular);
        var hide = new BridgeButton("Hide", new Rectangle(338, 248, 94, 35), Hex(0x8b5cf6), Hex(0x151719), null);
        hide.AccessibleName = "Hide to notification tray"; hide.Click += delegate { Hide(); };
        Controls.AddRange(new Control[] { minimize, close, more, hardware, whatsapp, summary, hide });
        tips.SetToolTip(hardware, "Local hardware adapter. Manage device connections in your institute’s webapp.");
        tips.SetToolTip(whatsapp, "Local WhatsApp adapter. Manage account linking in your institute’s webapp.");
        SetAdapterStates("Starting...", "Starting...");
    }
    public void OpenMenu(ContextMenuStrip menu) { menu.Show(more, new Point(more.Width - menu.Width, more.Height)); }
    public void SetAdapterStates(string hardware, string whatsapp) {
        SetState(hardwareState, hardwareDot, hardware); SetState(whatsappState, whatsappDot, whatsapp);
        bool h = hardware == "Ready", w = whatsapp == "Ready";
        summary.Text = h && w ? "All systems ready" : h ? "WhatsApp needs attention" : w ? "Hardware needs attention" : "Check adapter status";
        if (hardware.StartsWith("Starting") && whatsapp.StartsWith("Starting")) summary.Text = "Starting adapters";
    }
    void SetState(Label label, StatusDot dot, string state) {
        label.Text = state == "Ready" ? "Ready" : state.StartsWith("Stopped") ? "Stopped" : state == "Starting..." ? "Starting" : "Not responding";
        dot.StatusColor = state == "Ready" ? Hex(0x32cd91) : state.StartsWith("Stopped") ? Hex(0xff717a) : Hex(0xe5b74a);
        tips.SetToolTip(label, state == "Ready" ? "Local adapter is ready. Check the webapp for device/account connection." : state);
        dot.Invalidate();
    }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e);
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        g.ScaleTransform(ClientSize.Width / 460f, ClientSize.Height / 300f);
        using (var brush = new SolidBrush(Hex(0x22262c))) g.FillRectangle(brush, 0, 0, 460, 35);
        g.DrawImage(logo, new Rectangle(12, 8, 20, 20));
        g.DrawImage(logo, new Rectangle(28, 57, 32, 32));
    }
    protected override void OnSizeChanged(EventArgs e) {
        base.OnSizeChanged(e);
        if (ClientSize.Width <= 0 || ClientSize.Height <= 0) return;
        using (var path = BridgeDrawing.Round(new RectangleF(0, 0, Width, Height), 14 * Width / 460f)) {
            var previous = Region; Region = new Region(path); if (previous != null) previous.Dispose();
        }
    }
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool ReleaseCapture();
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wparam, IntPtr lparam);
    void BeginDrag() { ReleaseCapture(); SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); }
    protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); if (e.Button == MouseButtons.Left && e.Y < 35 * ClientSize.Height / 300f) BeginDrag(); }
    protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Escape) { Hide(); e.Handled = true; } base.OnKeyDown(e); }
    protected override void Dispose(bool disposing) { if (disposing) { tips.Dispose(); logo.Dispose(); } base.Dispose(disposing); }
}

sealed class BridgeLabel : Label {
    protected override void OnPaint(PaintEventArgs e) {
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, ForeColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.EndEllipsis);
    }
}

static class BridgeDrawing {
    public static GraphicsPath Round(RectangleF r, float radius) {
        var path = new GraphicsPath(); float d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90); path.AddArc(r.Right-d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right-d, r.Bottom-d, d, d, 0, 90); path.AddArc(r.X, r.Bottom-d, d, d, 90, 90); path.CloseFigure(); return path;
    }
}
sealed class StatusDot : Control {
    public Color StatusColor = Color.Goldenrod;
    public StatusDot(Point location) { Location = location; Size = new Size(8, 8); SetStyle(ControlStyles.SupportsTransparentBackColor, true); BackColor = Color.Transparent; }
    protected override void OnPaint(PaintEventArgs e) { e.Graphics.SmoothingMode = SmoothingMode.AntiAlias; using (var brush = new SolidBrush(StatusColor)) e.Graphics.FillEllipse(brush, 0, 0, Width-1, Height-1); }
}
sealed class StatusTile : Panel {
    readonly string kind;
    public StatusTile(Rectangle bounds, Color background, string icon) { Bounds = bounds; BackColor = background; kind = icon; DoubleBuffered = true; }
    protected override void OnSizeChanged(EventArgs e) { base.OnSizeChanged(e); if (Width < 26 || Height < 26) return; using (var path = BridgeDrawing.Round(new RectangleF(0, 0, Width, Height), 13 * Width / 194f)) { var old = Region; Region = new Region(path); if (old != null) old.Dispose(); } }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e); var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        g.ScaleTransform(Width / (kind == "hardware" ? 194f : 196f), Height / 111f);
        using (var pen = new Pen(Color.FromArgb(229, 183, 74), 1.6f)) {
            pen.StartCap = pen.EndCap = LineCap.Round;
            if (kind == "hardware") {
                using (var path = BridgeDrawing.Round(new RectangleF(17, 18, 17, 22), 3)) g.DrawPath(pen, path);
                g.DrawLine(pen, 21, 24, 30, 24); g.DrawLine(pen, 21, 32, 30, 32);
            } else {
                using (var path = new GraphicsPath()) {
                    path.AddBezier(20,20,31,12,45,24,37,35); path.AddBezier(37,35,33,40,27,40,23,37);
                    path.AddLine(23,37,16,39); path.AddLine(16,39,18,32); path.AddBezier(18,32,15,28,15,24,20,20); path.CloseFigure(); g.DrawPath(pen,path);
                }
            }
        }
    }
}
sealed class BridgeButton : Button {
    readonly Color fill, ink; readonly string glyph;
    bool hovered;
    public BridgeButton(string label, Rectangle bounds, Color background, Color foreground, string icon) {
        Text = label; Bounds = bounds; fill = background; ink = foreground; glyph = icon;
        Font = new Font("Segoe UI Semibold", 13, FontStyle.Regular, GraphicsUnit.Pixel); FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0; BackColor = background; ForeColor = foreground; Cursor = Cursors.Hand;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
    }
    protected override void OnMouseEnter(EventArgs e) { hovered = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hovered = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnPaint(PaintEventArgs e) {
        var g=e.Graphics; g.SmoothingMode=SmoothingMode.AntiAlias;
        g.Clear(Parent.BackColor);
        Color surface = hovered ? ControlPaint.Light(fill, .10f) : fill;
        using (var brush = new SolidBrush(surface)) {
            if (glyph == null) using (var path=BridgeDrawing.Round(new RectangleF(0,0,Width,Height),9*Height/35f)) g.FillPath(brush,path);
            else g.FillRectangle(brush,ClientRectangle);
        }
        float cx=Width/2f,cy=Height/2f;
        using (var pen=new Pen(ink,1.3f*Height/35f)) using(var brush=new SolidBrush(ink)) {
            if(glyph=="close") { g.DrawLine(pen,cx-4,cy-4,cx+4,cy+4); g.DrawLine(pen,cx+4,cy-4,cx-4,cy+4); }
            else if(glyph=="minimize") g.DrawLine(pen,cx-5,cy,cx+5,cy);
            else if(glyph=="more") foreach(int dx in new[]{-5,0,5}) g.FillEllipse(brush,cx+dx-1.4f,cy-1.4f,2.8f,2.8f);
            else TextRenderer.DrawText(g,Text,Font,ClientRectangle,ink,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
        }
        if (Focused && ShowFocusCues) ControlPaint.DrawFocusRectangle(g,new Rectangle(3,3,Width-6,Height-6),ink,surface);
    }
}
