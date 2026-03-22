async function loadData() {
  const res = await fetch("./gsheet_data.json");
  if (!res.ok) {
    throw new Error(`Failed to load data.json: ${res.status}`);
  }
  return res.json();
}

function populateSheetSelect(data) {
  const select = document.getElementById("sheet-select");

  for (const sheetName of data.sheetOrder) {
    const option = document.createElement("option");
    option.value = sheetName;
    option.textContent = sheetName;
    select.appendChild(option);
  }

  return select;
}

function renderSheet(data, sheetName) {
  const output = document.getElementById("output");
  const sheet = data.sheets[sheetName];

  output.textContent = JSON.stringify(sheet.items, null, 2);
}

async function main() {
  const data = await loadData();
  const select = populateSheetSelect(data);

  const initialSheet = data.sheetOrder[0];
  if (initialSheet) {
    select.value = initialSheet;
    renderSheet(data, initialSheet);
  }

  select.addEventListener("change", () => {
    renderSheet(data, select.value);
  });
}

main().catch((err) => {
  document.getElementById("output").textContent = String(err);
});
