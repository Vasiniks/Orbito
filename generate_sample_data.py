import json
import uuid
import random

vendors = [
    {"id": "v1", "name": "McMaster-Carr", "url": "mcmaster.com"},
    {"id": "v2", "name": "AndyMark", "url": "andymark.com"},
    {"id": "v3", "name": "VEX Robotics", "url": "vexrobotics.com"},
    {"id": "v4", "name": "REV Robotics", "url": "revrobotics.com"},
]

locations = [
    {"id": "l1", "name": "Main Storage Room", "type": "storage", "color": "#3b82f6", "x": 10, "y": 10, "w": 30, "h": 30, "containers": []},
    {"id": "l2", "name": "Machine Shop", "type": "workspace", "color": "#10b981", "x": 50, "y": 10, "w": 40, "h": 40, "containers": []},
]

projects = [
    {"id": "p1", "name": "Robot", "description": "2026 Competition Robot", "status": "active", "parentId": None}
]

categories = ["Hardware", "Electronics", "Motors", "Sensors", "Pneumatics", "Raw Material"]
part_names = [
    "1/2\" Hex Shaft - 36\"", "Falcon 500 Motor", "NEO Brushless Motor", "Spark MAX Motor Controller", 
    "Pigeon 2.0 IMU", "Limelight 3", "1/4-20 x 1\" Socket Head Bolt", "10-32 x 1/2\" Button Head Bolt",
    "2x1 Aluminum Tubing (1/8\" wall)", "Swerve Drive Module X", "12V 18Ah SLA Battery", "Compressor (1.1 CFM)",
    "Air Tank (Plastic)", "Double Solenoid Valve", "RoboRIO 2.0", "Radio Power Module", "Network Switch (5 port)",
    "CANivore", "Absolute Encoder (Thrifty)", "Hex Bearing (1/2\" ID, 1.125\" OD)", "Flanged Bearing (3/8\" ID)"
]

parts = []
for name in part_names:
    cat = random.choice(categories)
    vendor = random.choice(vendors)
    loc = random.choice(locations)
    cost = round(random.uniform(1.50, 250.00), 2)
    instock = random.randint(0, 50)
    needed = random.randint(0, 20)
    
    parts.append({
        "id": str(uuid.uuid4()),
        "name": name,
        "categoryId": None,
        "category": cat,
        "vendorId": vendor["id"],
        "locationId": loc["id"],
        "projectId": "p1",
        "unitCost": cost,
        "inStock": instock,
        "needed": needed,
        "onshapeUrl": "",
        "notes": f"Sample data part for {name}"
    })

data = {
    "vendors": vendors,
    "locations": locations,
    "projects": projects,
    "parts": parts,
    "tools": [],
    "users": [],
    "tasks": []
}

with open("sample_data.json", "w") as f:
    json.dump(data, f, indent=2)
print("sample_data.json created successfully")
