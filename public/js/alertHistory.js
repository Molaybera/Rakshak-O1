let allAlerts = [];
let filteredAlerts = [];

// DOM Elements
const alertTableBody = document.getElementById('alertTableBody');
const searchTypeInput = document.getElementById('searchType');
const filterDateInput = document.getElementById('filterDate');

// Fetch alerts on load
document.addEventListener('DOMContentLoaded', () => {
    fetchAlerts();
});

// Fetch all alerts from backend
async function fetchAlerts() {
    try {
        const response = await fetch('/api/alerts/list');
        const data = await response.json();
        
        allAlerts = data;
        filteredAlerts = [...allAlerts];
        
        renderTable(filteredAlerts);
    } catch (error) {
        console.error("Error fetching alerts:", error);
        alertTableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--fire);">Failed to load alerts. Ensure server is running.</td></tr>`;
    }
}

// Render the table rows
function renderTable(data) {
    if (data.length === 0) {
        alertTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">No alerts found matching the criteria.</td></tr>`;
        return;
    }

    let rowsHtml = '';
    
    data.forEach(alert => {
        const dateObj = new Date(alert.timestamp);
        const formattedDate = dateObj.toLocaleDateString();
        const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const typeClass = alert.type === 'fire' ? 'fire' : (alert.type === 'intruder' ? 'intruder' : 'unknown');
        
        let detailText = '';
        if (alert.type === 'fire') {
            detailText = `Conf: ${(alert.confidence * 100).toFixed(1)}%`;
        } else {
            detailText = `People: ${alert.personCount} | Liveness: ${(alert.livenessScore * 100).toFixed(0)}%`;
        }

        const location = alert.metadata?.location || 'Main Entrance';

        // Evidence thumbnail logic
        let evidenceHtml = '<span style="font-size: 0.75rem; color: var(--text-muted);">No image</span>';
        if (alert.evidenceImage && alert.evidenceImage.startsWith('data:image')) {
            evidenceHtml = `<img src="${alert.evidenceImage}" class="evidence-thumb" alt="Evidence" onclick="viewImage('${alert.evidenceImage}')" style="cursor:pointer;" title="Click to view">`;
        }

        rowsHtml += `
            <tr>
                <td>
                    <div style="font-weight: 600; color: var(--text-main);">${formattedDate}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${formattedTime}</div>
                </td>
                <td>
                    <span class="badge ${typeClass}">${alert.type}</span>
                </td>
                <td>
                    <span style="font-size: 0.875rem;">${detailText}</span>
                </td>
                <td>
                    <span style="font-size: 0.875rem;">${location}</span>
                </td>
                <td>
                    ${evidenceHtml}
                </td>
                <td>
                    <button class="btn-delete" onclick="deleteAlert('${alert._id}')">Delete</button>
                </td>
            </tr>
        `;
    });

    alertTableBody.innerHTML = rowsHtml;
}

// Open full image in new tab/window
function viewImage(base64Str) {
    const w = window.open("");
    w.document.write(`<img src="${base64Str}" style="max-width:100%;">`);
}

// Filter alerts locally based on search term and date
function filterAlerts() {
    const searchTerm = searchTypeInput.value.toLowerCase().trim();
    const filterDate = filterDateInput.value; // Format: YYYY-MM-DD

    filteredAlerts = allAlerts.filter(alert => {
        // Match Search Type
        const matchSearch = alert.type.toLowerCase().includes(searchTerm);
        
        // Match Date
        let matchDate = true;
        if (filterDate) {
            const alertDateStr = new Date(alert.timestamp).toISOString().split('T')[0];
            matchDate = (alertDateStr === filterDate);
        }

        return matchSearch && matchDate;
    });

    renderTable(filteredAlerts);
}

// Delete an alert
async function deleteAlert(id) {
    if (!confirm("Are you sure you want to delete this alert? This action cannot be undone.")) return;

    try {
        const response = await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
        const result = await response.json();

        if (result.success) {
            // Remove from local arrays and re-render
            allAlerts = allAlerts.filter(a => a._id !== id);
            filterAlerts();
        } else {
            alert("Failed to delete alert: " + result.message);
        }
    } catch (error) {
        console.error("Error deleting alert:", error);
        alert("Server error while deleting alert.");
    }
}

// Download PDF functionality
function downloadPDF() {
    if (typeof window.jspdf === 'undefined') {
        alert("PDF generator library is not loaded properly.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add Report Header
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("Rakshak O1 - Alert History Report", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    
    if (searchTypeInput.value || filterDateInput.value) {
        doc.text(`Filters applied: Type="${searchTypeInput.value}" Date="${filterDateInput.value}"`, 14, 36);
    }

    // Prepare table data
    const tableColumn = ["Date", "Time", "Type", "Details", "Location"];
    const tableRows = [];

    filteredAlerts.forEach(alert => {
        const dateObj = new Date(alert.timestamp);
        
        let details = '';
        if (alert.type === 'fire') {
            details = `Conf: ${(alert.confidence * 100).toFixed(1)}%`;
        } else {
            details = `People: ${alert.personCount}, Liveness: ${(alert.livenessScore * 100).toFixed(0)}%`;
        }

        const rowData = [
            dateObj.toLocaleDateString(),
            dateObj.toLocaleTimeString(),
            alert.type.toUpperCase(),
            details,
            alert.metadata?.location || 'Main Entrance'
        ];
        
        tableRows.push(rowData);
    });

    // AutoTable plugin
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 45,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }, // professional blue
        styles: { fontSize: 9, cellPadding: 3 },
    });

    // Save the PDF
    doc.save(`Rakshak_Alert_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}
