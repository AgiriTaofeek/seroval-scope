// Runs once when DevTools opens for a tab. Its only job is to register the
// custom panel — all real logic (capture, decode, UI) lives in the panel
// page itself, which persists for the life of the DevTools window once
// created (it isn't torn down when switching DevTools tabs), so there's no
// need for a background script to hold state for it.
chrome.devtools.panels.create(
	"SerovalScope",
	"/icon/48.png",
	"/panel.html",
);
