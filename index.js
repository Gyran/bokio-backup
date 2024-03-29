const { promisify } = require('util');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

const got = require('got');

const CONFIG = require('./config');

const BASE_URL = 'https://app.bokio.se';

const DOWNLOAD_FILES = [
  { filename: 'Customers.csv', url: '/Invoices/Customer/Export' },
  { filename: 'Articles.csv', url: '/Invoices/Article/Export' },
  { filename: 'Employees.csv', url: '/Salary/api/v1/Employees/Export' },
  {
    filename: 'InvoiceSummaries.csv',
    url: '/Invoices/Invoice/Export',
    body: { Mode: 'InvoiceSummaryOnly' },
  },
  {
    filename: 'InvoiceRows.csv',
    url: '/Invoices/Invoice/Export',
    body: { Mode: 'WithInvoiceRows' },
  },
];

const bokioClient = got.extend({
  prefixUrl: `${BASE_URL}/${CONFIG.COMPANY_ID}`,
  headers: {
    clientreleasedate: '2021-05-06T11:08:06.0000000',
    clientversion: '1.0.7796.20043',
    cookie: CONFIG.COOKIE,
  },
});

const downloadFile = async (backupFolder, fileDownloadDesc) => {
  const { filename, url, body } = fileDownloadDesc;

  const options = {};
  if (body) {
    options.method = 'POST';
    options.headers = { 'Content-Type': 'application/json;charset=UTF-8' };
    options.body = JSON.stringify(body);
  }

  await pipeline(
    bokioClient.stream(url, options),
    fs.createWriteStream(path.join(backupFolder, filename)),
  );
};

const getTodaysDate = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const date = now.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${date}`;
};

const ensureFolder = async (folder) => {
  try {
    await fsp.mkdir(folder);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

const doit = async () => {
  try {
    const backupFolder = path.join(CONFIG.OUTPUT_PATH, getTodaysDate());
    await ensureFolder(backupFolder);

    console.log('Starting to backup to', backupFolder);

    const filesToDownload = [...DOWNLOAD_FILES];

    // Get the dynamic files per year
    const years = await bokioClient
      .get('/Settings/ExportCompany/ListYears')
      .json();

    if (Array.isArray(years)) {
      for (let year of years) {
        const startYear = new Date(year.StartDate).getFullYear();
        const endYear = new Date(year.EndDate).getFullYear();
        const id = year.Id;

        const filePostfix = `${startYear}${endYear}`;

        filesToDownload.push({
          filename: `Bokforing_${filePostfix}.sie`,
          url: `/Settings/ExportCompany/SieForYear?settingsId=${id}`,
        });
        filesToDownload.push({
          filename: `Kvitton_${filePostfix}.zip`,
          url: `/Settings/ExportCompany/ReceiptsForYear?yearStart=${startYear}&yearEnd=${endYear}`,
        });
        filesToDownload.push({
          filename: `Verifikationer_${filePostfix}.tsv`,
          url: `/Settings/ExportCompany/TSVForYear?settingsId=${id}`,
        });
      }
    }

    for (const fileDownloadDesc of filesToDownload) {
      console.log('Starting to download', fileDownloadDesc.filename);
      await downloadFile(backupFolder, fileDownloadDesc);
    }
    console.log('All done!', backupFolder);
  } catch (error) {
    console.log('err', error);
  }
};

doit();
