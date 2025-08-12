// public/app.js
document.addEventListener('DOMContentLoaded', () => {
  const pincodeEl = document.getElementById('pincode');
  const weightEl = document.getElementById('weight');
  const serviceEl = document.getElementById('service');
  const transportRow = document.getElementById('transport-row');
  const transportEl = document.getElementById('transport');
  const btn = document.getElementById('checkBtn');
  const result = document.getElementById('result');

  function showTransportIfNeeded() {
    const service = serviceEl.value;
    const weight = parseFloat(weightEl.value || 0);
    if (service === 'normal' && weight >= 5) transportRow.style.display = 'block';
    else transportRow.style.display = 'none';
  }

  serviceEl.addEventListener('change', showTransportIfNeeded);
  weightEl.addEventListener('input', showTransportIfNeeded);

  btn.addEventListener('click', async () => {
    result.innerHTML = 'Checking...';
    const payload = {
      pincode: pincodeEl.value.trim(),
      weightKg: parseFloat(weightEl.value),
      serviceType: serviceEl.value,
      transportMode: transportEl.value
    };

    try {
      const resp = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!data.ok) {
        result.innerHTML = `<div class="error">Error: ${data.msg || 'Unknown error'}</div>`;
        return;
      }
      result.innerHTML = `
        <div class="success">Price: ₹${data.price}</div>
        <div><strong>Area:</strong> ${data.areaName || 'N/A'}</div>
        <div><strong>Category:</strong> ${data.category}</div>
        <div><strong>Service:</strong> ${data.serviceType}</div>
      `;
    } catch (e) {
      result.innerHTML = `<div class="error">Network error: ${e.message}</div>`;
    }
  });
});
