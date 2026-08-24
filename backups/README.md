# Data snapshots

Each folder here is a **point-in-time export of the live Orbito database**, named by
the moment it was taken. Snapshots are immutable: nothing in an existing folder is
ever rewritten by later work. A new export always creates a new folder.

Each folder holds:

| File | What it is |
| --- | --- |
| `orbito-snapshot.json` | Every collection, full fidelity — including photos and drawings. This is the restore file. |
| `parts.csv` | Parts Library as a spreadsheet: stock, baseline, cost, vendor, location, links. |
| `spreadsheet.csv` | Master Spreadsheet rows: part number, subsystem, status, material, machine. |

## Privacy

This repository is **public**, so snapshots committed here are sanitized: user email
addresses are masked (`e*****@1360.ca`) and per-device identifiers removed. Roles,
approval status, and every piece of workspace data (parts, projects, BOM lines,
locations, vendors, settings, activity) are complete and unmodified.

User accounts rebuild themselves from Google sign-in, so masked emails cost nothing
on restore.

## Taking a new snapshot

The app's own Settings → Backup & Data → Export covers day-to-day backups. The
folders here are milestone captures taken before large changes.
