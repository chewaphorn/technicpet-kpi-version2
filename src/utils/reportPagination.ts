/** Lay out complete report blocks on A4 pages before printing or rasterizing. */
export function paginateReport(source: HTMLElement, destination: HTMLElement): number {
  destination.replaceChildren();
  const pages: HTMLElement[] = [];
  const title = source.querySelector('h1')?.textContent || 'Technic Pet Report';
  let body: HTMLElement;
  let contentCount = 0;

  const newPage = () => {
    const page = document.createElement('section');
    page.className = 'pdf-report-page';
    page.dataset.pdfPage = String(pages.length + 1);
    body = document.createElement('div');
    body.className = 'pdf-page-content';
    if (pages.length) {
      const heading = document.createElement('header');
      heading.className = 'pdf-running-header';
      heading.textContent = `${title} (ต่อ)`;
      body.append(heading);
    }
    page.append(body);
    destination.append(page);
    pages.push(page);
    contentCount = 0;
  };
  const fits = () => {
    const last = body.lastElementChild;
    return !last || last.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 0.25;
  };
  const clone = (node: HTMLElement) => node.cloneNode(true) as HTMLElement;

  // Usually a whole table fits on a fresh page. For unusually long names,
  // split only BETWEEN rows, repeating the heading and thead on every page.
  // Parallel tables advance together, so neither column can be cut mid-row.
  const splitTables = (block: HTMLElement) => {
    const tables = [...block.querySelectorAll('table')];
    const rows = tables.map(table => [...table.tBodies[0]?.rows || []]);
    const rowCount = Math.max(...rows.map(group => group.length));
    if (!rowCount) throw new Error('ส่วนรายงานมีความสูงเกินหน้า A4 กรุณาตรวจสอบข้อความในรายงาน');
    let rowIndex = 0;
    while (rowIndex < rowCount) {
      const fragment = clone(block);
      const bodies = [...fragment.querySelectorAll('tbody')];
      bodies.forEach(tbody => tbody.replaceChildren());
      body.append(fragment);
      let accepted = 0;
      while (rowIndex < rowCount) {
        const added = rows.map((group, column) => {
          if (!group[rowIndex]) return null;
          const row = group[rowIndex].cloneNode(true) as HTMLTableRowElement;
          bodies[column].append(row);
          return row;
        });
        if (!fits()) {
          added.forEach(row => row?.remove());
          break;
        }
        rowIndex++;
        accepted++;
      }
      if (!accepted) {
        fragment.remove();
        if (!contentCount) throw new Error('ข้อความในหนึ่งแถวสูงเกินหน้า A4 กรุณาย่อข้อความก่อนส่งออก');
        newPage();
      } else {
        contentCount++;
        if (rowIndex < rowCount) newPage();
      }
    }
  };

  newPage();
  const blocks = [...source.children].flatMap(child =>
    child.hasAttribute('data-pdf-flow') ? [...child.children] : [child]
  ) as HTMLElement[];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const copy = clone(block);
    body.append(copy);
    // Keep a section heading with at least the next block's beginning.
    let headingFits = true;
    if (block.hasAttribute('data-pdf-keep-next') && blocks[index + 1]) {
      const next = clone(blocks[index + 1]);
      body.append(next);
      headingFits = fits();
      next.remove();
    }
    if (fits() && headingFits) { contentCount++; continue; }
    copy.remove();
    if (contentCount) newPage();
    body.append(copy);
    if (fits()) { contentCount++; continue; }
    copy.remove();
    if (block.querySelector('table')) splitTables(block);
    else throw new Error('ส่วนรายงานมีความสูงเกินหน้า A4 กรุณาตรวจสอบข้อความในรายงาน');
  }
  pages.forEach((page, index) => {
    const footer = document.createElement('footer');
    footer.className = 'pdf-page-number';
    footer.textContent = `TECHNIC PET CO., LTD. · หน้า ${index + 1} / ${pages.length}`;
    page.append(footer);
  });
  return pages.length;
}
