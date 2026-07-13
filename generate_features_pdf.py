import datetime
import os
from fpdf import FPDF

class LaunchpadFeaturesPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.current_date = datetime.date.today().strftime("%B %d, %Y")
        self.set_margins(20, 20, 20)

    def header(self):
        if self.page_no() == 1:
            return  # Skip header on cover page
        # Top banner
        self.set_fill_color(30, 41, 59)  # Slate 800
        self.rect(0, 0, 210, 15, "F")
        
        self.set_y(3)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(255, 255, 255)
        self.cell(0, 8, "LAUNCHPAD  |  SYSTEM CAPABILITIES & FEATURES DIRECTORY", align="C", ln=True)
        self.set_y(22)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 116, 139) # Slate 500
        self.cell(0, 10, f"Page {self.page_no()} of {{nb}}  |  Launchpad Technical Specifications", align="C")

    def create_title_page(self):
        self.add_page()
        
        # Elegant border
        self.set_line_width(0.5)
        self.set_draw_color(30, 41, 59) # Slate 800
        self.rect(10, 10, 190, 277)
        
        self.set_y(60)
        # Main Title
        self.set_font("Helvetica", "B", 36)
        self.set_text_color(15, 23, 42) # Slate 900
        self.cell(0, 15, "LAUNCHPAD", align="C", ln=True)
        self.ln(5)
        
        # Subtitle
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(59, 130, 246) # Blue 500
        self.cell(0, 10, "Robotics Team Operations System", align="C", ln=True)
        self.ln(10)
        
        # Accent Line
        self.set_fill_color(59, 130, 246)
        self.rect(85, self.get_y(), 40, 2, "F")
        self.ln(20)
        
        # Description
        self.set_font("Helvetica", "", 11)
        self.set_text_color(71, 85, 105) # Slate 600
        self.set_x(30)
        self.multi_cell(150, 6, 
            "Launchpad is an offline-first, client-side browser management application "
            "designed to coordinate parts inventories, bills of materials (BOM), "
            "vendors, tooling checkouts, member roles, kanban tasks, and "
            "workspace organization for high-performing engineering and robotics teams.",
            align="C"
        )
        
        # Metadata block at bottom
        self.set_y(220)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(15, 23, 42)
        self.cell(0, 6, "PRODUCT DIRECTORY", align="C", ln=True)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(100, 116, 139)
        self.cell(0, 5, f"Published: {self.current_date}", align="C", ln=True)
        self.cell(0, 5, "Status: Deployed & Active", align="C", ln=True)

    def create_section_header(self, text, icon=""):
        self.ln(6)
        self.set_fill_color(241, 245, 249) # Slate 100
        self.set_text_color(15, 23, 42) # Slate 900
        self.set_font("Helvetica", "B", 12)
        
        # Add colored left bar
        y = self.get_y()
        self.rect(20, y, 3, 8, "F")
        self.set_fill_color(59, 130, 246) # Blue 500
        self.rect(20, y, 3, 8, "F")
        
        self.set_x(26)
        self.cell(0, 8, f"{icon} {text}", ln=True)
        self.ln(3)

    def create_bullet(self, title, desc):
        # Draw a custom bullet square to prevent character encoding issues
        self.set_fill_color(59, 130, 246) # Blue 500
        y = self.get_y() + 2
        self.rect(22, y, 2, 2, "F")
        
        self.set_x(28)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(15, 23, 42)
        self.cell(self.get_string_width(title + ": ") + 2, 6, title + ": ", ln=0)
        
        self.set_font("Helvetica", "", 10)
        self.set_text_color(71, 85, 105)
        self.multi_cell(0, 6, desc)
        self.ln(1)

def generate_pdf():
    pdf = LaunchpadFeaturesPDF()
    pdf.alias_nb_pages()
    
    # 1. Create Cover Page
    pdf.create_title_page()
    
    # 2. Detailed Features Page
    pdf.add_page()
    
    # System Architecture Section
    pdf.create_section_header("CORE PLATFORM & ARCHITECTURE")
    pdf.create_bullet("Offline-First Storage", "Driven entirely in the browser using IndexedDB to store data locally. Requires zero server configuration, runs standalone, and works with standard file schemes or local static servers.")
    pdf.create_bullet("Data Portability (Backup/Restore)", "Allows teams to backup the entire application state into a single portable JSON file, and restore it on another machine to prevent data loss or sync team workspaces.")
    pdf.create_bullet("PIN-Based Login & RBAC", "Incorporates role-based access controls supporting Captains, Leads, Mentors, and Members. Restricts moderation features to authorized users using secure 4-digit PIN authentication.")
    pdf.create_bullet("Dynamic Responsive Shell", "A custom UI dashboard framework crafted in vanilla CSS that automatically collapses and fits mobile screens, ensuring compatibility on laptops, tablets, and phones.")
    pdf.create_bullet("Secret Cat Command", "A hidden developer shortcut (Cmd + Shift + Option + K) that instantly spawns an animated cat overlay in the top-right corner of the interface.")
    
    # Projects Module
    pdf.create_section_header("PROJECTS & SUB-PROJECTS MODULE")
    pdf.create_bullet("Hierarchical Structure", "Supports creating top-level projects that can contain nested sub-projects to keep complex robotics assemblies and events organized.")
    pdf.create_bullet("Progress Analytics", "Automatically calculates project completion progress dynamically based on the percentage of completed tasks linked to the project.")
    pdf.create_bullet("Advanced Template Duplication", "Clones existing projects, replicating the exact hierarchy, linked BOM parts, and tasks while resetting statuses to default parameters for new builds.")
    pdf.create_bullet("Consolidated Detail Tabs", "Dedicated project detail dashboards presenting nested views for linked sub-projects, Bill of Materials items, and assigned tasks in one tabbed view.")
    
    # Parts & Inventory
    pdf.create_section_header("PARTS CATALOG & INVENTORY MODULE")
    pdf.create_bullet("Spreadsheet Table View", "Displays parts in a sortable grid showing photos, name, category, vendor, location, stock level, needed quantity, and unit cost.")
    pdf.create_bullet("Smart Restock Filters", "Automatically highlights parts that have dropped below safety stock quantities (In Stock < Needed) and allows location or category filtering.")
    pdf.create_bullet("Quick Stock Adjuster", "Features an incremental modifier modal to easily log parts received or consumed in bulk (e.g. +10, -5) without opening full edit records.")
    pdf.create_bullet("Media Attachment", "Allows file uploads to capture photos of parts, storing them directly in the IndexedDB catalog as high-fidelity Base64 DataURLs.")
    pdf.create_bullet("Bulk Operations", "Allows users to select multiple items via checkboxes and execute bulk deletion tasks in a single click.")
    
    # Page 3 for remaining modules
    pdf.add_page()
    
    # Bill of Materials (BOM)
    pdf.create_section_header("BILL OF MATERIALS (BOM) MODULE")
    pdf.create_bullet("Per-Project BOM Trackers", "Links parts catalog records directly to projects, tracking procurement and installation requirements for specific designs.")
    pdf.create_bullet("BOM Line Item Totals", "Automatically computes unit costs, needed quantities, total line costs, and sums up the overall project cost in a dedicated summary footer.")
    pdf.create_bullet("Procurement Workflow", "Tracks parts through four distinct stages: Not Started, Ordered, In Stock, and Installed.")
    pdf.create_bullet("Stat Cards & Progress Bars", "Renders high-level summary cards showing Total Items, Total Budget, Installed count, and percentage progress indicator.")
    pdf.create_bullet("CSV Data Export", "Enables one-click CSV compilation and download, formatted to import directly into Excel or Google Sheets for team budgeting.")

    # Tools Checkout
    pdf.create_section_header("TOOL CHAIN & CHECKOUT MODULE")
    pdf.create_bullet("Tool Directory", "Maintains an active log of tools, showing photos, storage locations, and active checkout states.")
    pdf.create_bullet("Condition Assessment", "Visual badges indicating tool health: Good (green), Needs Maintenance (amber), and Broken (red).")
    pdf.create_bullet("Interactive Checkout Engine", "Enables members to check out tools by selecting their name from the team roster. Tool cards dynamically switch to reflect checkout status.")
    pdf.create_bullet("Visual Search & Filter", "Allows searching tools by name or filtering by availability (Available vs Checked Out).")
    
    # Team & Roster
    pdf.create_section_header("TEAM ROSTER & PEOPLE MODULE")
    pdf.create_bullet("Role Categorization", "Tracks members categorized as Captain, Mentor, Lead, or Member with corresponding custom avatar icons.")
    pdf.create_bullet("Activity Tracking", "Detailed profiles show all active tasks assigned to the member and all tools currently checked out under their name.")
    pdf.create_bullet("Access Moderation Panel", "Allows Mentors to approve pending user registrations before they are granted read/write permissions to the database.")
    
    # Tasks (Kanban)
    pdf.create_section_header("KANBAN TASK BOARD")
    pdf.create_bullet("Interactive Kanban Tracks", "Tracks tasks visually across three workflow columns: To Do, In Progress, and Done.")
    pdf.create_bullet("Metadata Overlay", "Kanban cards display title, project association, assignee avatar, due dates, and priority indicators.")
    pdf.create_bullet("Priority Visualizers", "Color-coded priority dots signifying Low (green), Medium (orange), and High (red) priorities.")
    pdf.create_bullet("Advanced Roster Filtering", "Allows filtering task boards dynamically by assignee or by specific projects.")
    
    # Workspace Map
    pdf.create_section_header("WORKSPACE & STORAGE MAP")
    pdf.create_bullet("Interactive 2D Floorplan", "Renders a visual 600px floorplan mapping storage bins, workspaces, and machinery.")
    pdf.create_bullet("Coordinate Rendering", "Uses percentage-based coordinates (X, Y position and W, H dimensions) to scale and draw zones accurately on any screen size.")
    pdf.create_bullet("Location Audit Sidebar", "Clicking any map zone opens a details panel listing all parts and tools currently registered at that location.")
    
    # Save PDF
    pdf.output("Launchpad_Features_List.pdf")
    print("PDF features list compiled successfully as Launchpad_Features_List.pdf")

if __name__ == "__main__":
    generate_pdf()
