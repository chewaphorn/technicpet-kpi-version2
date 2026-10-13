const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const write=(p,s)=>fs.writeFileSync(p,s);
let s=read('src/App.tsx');
s=s.replace('import { subscribeToUserAuthorization }','import { canAccessScreen, canAccessReport, canConfigureDepartmentSheet, subscribeToUserAuthorization }');
const marker='  const handleOpenGoogleSheetsModal';
let i=s.indexOf(marker);
s=s.slice(0,i)+`  const permitted = (screen: ScreenId) => !!currentUser && canAccessScreen(currentUser.role, screen, currentUser.allowedScreens);
  const navigate = (screen: ScreenId) => { if (permitted(screen)) setCurrentScreen(screen); };
  useEffect(() => {
    setSelectedDocForTracking(null);
    setIsNewReportOpen(false);
    setIsPDFPreviewOpen(false);
    setIsGoogleSheetsModalOpen(false);
  }, [currentUser?.uid, currentUser?.role, JSON.stringify(currentUser?.allowedScreens)]);

`+s.slice(i);
s=s.replace("    if (currentUser?.role === 'sales_manager') {\n      setGoogleSheetTargetDept", "    if (!currentUser || currentUser.role === 'viewer') return;\n    if (dept && dept !== 'all' && !permitted(dept)) return;\n    if (currentUser?.role === 'sales_manager') {\n      setGoogleSheetTargetDept");
s=s.replace('    setSelectedDeptForPDF(dept);','    if (!canAccessReport(currentUser, dept)) return;\n    setSelectedDeptForPDF(dept);');
s=s.replace('            setCurrentScreen(screen);','            navigate(screen);').replaceAll('onNavigateScreen={setCurrentScreen}','onNavigateScreen={navigate}');
for(const dept of ['overview','sales','warehouse','delivery']) s=s.replace(`{currentScreen === '${dept}' && (`,`{currentScreen === '${dept}' && permitted('${dept}') && (`);
s=s.replace('<main className="flex-1 pb-16">','<main className="flex-1 pb-16">\n          {!permitted(currentScreen) && <p role="alert" className="p-8 text-rose-700">คุณไม่มีสิทธิ์ดูรายงานนี้ กรุณาเลือกเมนูของแผนกที่ได้รับอนุญาต</p>}');
for(const [name,dept] of [['Sales','sales'],['Warehouse','warehouse'],['Delivery','delivery']]) {
 s=s.replace(`  const handleSync${name} = async (urlOverride?: string) => {`,`  const handleSync${name} = async (urlOverride?: string) => {\n    if (!permitted('${dept}')) return;`);
}
s=s.replace('  const handleSyncAllDepartments = async () => {',"  const handleSyncAllDepartments = async () => {\n    if (currentUser?.role !== 'admin') return;");
s=s.replace('isOpen={isPDFPreviewOpen}', 'isOpen={isPDFPreviewOpen && canAccessReport(currentUser, selectedDeptForPDF)}');
s=s.replace('isOpen={isGoogleSheetsModalOpen}',"isOpen={isGoogleSheetsModalOpen && canConfigureDepartmentSheet(currentUser.role, googleSheetTargetDept) && (googleSheetTargetDept === 'all' || permitted(googleSheetTargetDept))}");
// Never pass other departments' rows into shared search, preview or export components.
for(const [prop,value,dept] of [['warehouseDocs','warehouseDocs','warehouse'],['deliveryTrips','deliveryTrips','delivery'],['detailedSalesOrders','detailedSalesOrders','sales'],['detailedOrders','detailedSalesOrders','sales'],['salesReps','salesReps','sales'],['topProducts','topProducts','sales'],['topSpenders','topSpenders','sales']]) {
 s=s.replaceAll(prop+'={'+value+'}',prop+"={permitted('"+dept+"') ? "+value+" : []}");
}
for(const dept of ['sales','warehouse','delivery']) s=s.replaceAll(dept+'Summary={'+dept+'Summary}',dept+"Summary={permitted('"+dept+"') ? "+dept+"Summary : undefined}");
write('src/App.tsx',s);
s=read('src/components/NewReportModal.tsx');
s="import { canAccessReport } from '../lib/authControl';\n"+s;
s=s.replace("  // Export File Format",`  const canExport = (dept: 'all' | 'sales' | 'warehouse' | 'delivery') => canAccessReport(currentUser, dept);
  useEffect(() => {
    if (!canExport(selectedDept)) {
      const first = (['sales', 'warehouse', 'delivery', 'all'] as const).find(canExport);
      if (first) setSelectedDept(first);
    }
  }, [isOpen, currentUser?.role, JSON.stringify(currentUser?.allowedScreens)]);

  // Export File Format`);
s=s.replace('  const handleExportExcel = () => {','  const handleExportExcel = () => {\n    if (!canExport(selectedDept)) return;');
s=s.replace('onClick={() => setSelectedDept(item.id as any)}','disabled={!canExport(item.id as any)}\n                    onClick={() => { if (canExport(item.id as any)) setSelectedDept(item.id as any); }}');
s=s.replace('onOpenPDFPreview(selectedDept as any, startDate, endDate);','if (canExport(selectedDept)) onOpenPDFPreview(selectedDept, startDate, endDate);');
write('src/components/NewReportModal.tsx',s);
s=read('src/components/PDFReportPreviewModal.tsx');
s="import { canAccessReport } from '../lib/authControl';\n"+s;
s=s.replace('if (!isOpen) return null;', 'if (!isOpen || !canAccessReport(currentUser, activeDept)) return null;');
s=s.replace('onClick={() => setActiveDept(tab.id as any)}','disabled={!canAccessReport(currentUser, tab.id as any)}\n                onClick={() => { if (canAccessReport(currentUser, tab.id as any)) setActiveDept(tab.id as any); }}');
for(const handler of ['handleBrowserPrint','handleDownloadPDF']) s=s.replace(new RegExp('(const '+handler+' = (?:async )?\\(\\) => \\{)'), '$1\n    if (!canAccessReport(currentUser, activeDept)) return;');
write('src/components/PDFReportPreviewModal.tsx',s);
