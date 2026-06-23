const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'apps', 'api', 'src');

function getAllControllers(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllControllers(filePath, fileList);
    } else if (file.endsWith('.controller.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const controllers = getAllControllers(apiDir);

let md = '# Task Tracker API Documentation\\n\\n';
md += 'Version: 1.0\\n\\n';
md += 'Generated automatically from Swagger decorators.\\n\\n';

const methods = ['Get', 'Post', 'Patch', 'Delete', 'Put'];

for (const file of controllers) {
  const content = fs.readFileSync(file, 'utf8');
  
  let basePath = '';
  const controllerMatch = content.match(/@Controller\(['"]([^'"]+)['"]/);
  if (controllerMatch) basePath = controllerMatch[1];

  let tag = path.basename(file, '.controller.ts');
  const tagMatch = content.match(/@ApiTags\(['"]([^'"]+)['"]/);
  if (tagMatch) tag = tagMatch[1];

  md += '## ' + tag + '\\n\\n';

  const endpoints = [];
  const lines = content.split('\\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    let isMethodLine = false;
    let httpMethod = '';
    let routePath = '';

    for (const m of methods) {
      if (line.startsWith('@' + m + '(')) {
        isMethodLine = true;
        httpMethod = m.toUpperCase();
        const startQuote = line.indexOf("'");
        if (startQuote !== -1) {
          const endQuote = line.indexOf("'", startQuote + 1);
          if (endQuote !== -1) {
            routePath = line.substring(startQuote + 1, endQuote);
          }
        } else {
          const startDQuote = line.indexOf('"');
          if (startDQuote !== -1) {
            const endDQuote = line.indexOf('"', startDQuote + 1);
            if (endDQuote !== -1) {
              routePath = line.substring(startDQuote + 1, endDQuote);
            }
          }
        }
        break;
      }
    }

    if (isMethodLine) {
      let fullPath = '';
      if (basePath && routePath) {
         fullPath = '/' + basePath + '/' + routePath;
      } else if (basePath) {
         fullPath = '/' + basePath;
      } else if (routePath) {
         fullPath = '/' + routePath;
      }
      fullPath = fullPath.split('//').join('/');

      let summary = 'No summary';
      const params = [];
      const responses = [];
      
      for (let j = i - 1; j >= 0 && lines[j].trim().startsWith('@'); j--) {
        const decLine = lines[j].trim();
        
        const summaryMatch = decLine.match(/@ApiOperation\(\{.*summary:\s*['"]([^'"]+)['"]/);
        if (summaryMatch) summary = summaryMatch[1];
        
        const paramMatch = decLine.match(/@ApiParam\(\{.*name:\s*['"]([^'"]+)['"]/);
        if (paramMatch) params.push({ name: paramMatch[1], in: 'path', req: true });
        
        const queryMatch = decLine.match(/@ApiQuery\(\{.*name:\s*['"]([^'"]+)['"]/);
        if (queryMatch) params.push({ name: queryMatch[1], in: 'query', req: !decLine.includes('required: false') });
        
        const resMatch = decLine.match(/@ApiResponse\(\{.*status:\s*(\d+).*description:\s*['"]([^'"]+)['"]/);
        if (resMatch) responses.push({ status: resMatch[1], desc: resMatch[2] });
      }

      endpoints.push({ httpMethod, routePath: fullPath, summary, params: params.reverse(), responses: responses.reverse() });
    }
  }

  for (const ep of endpoints) {
    md += '### [' + ep.httpMethod + '] ' + ep.routePath + '\\n\\n';
    md += '**Summary**: ' + ep.summary + '\\n\\n';
    
    if (ep.params.length > 0) {
      md += '| Parameter | In | Required |\\n';
      md += '|---|---|---|\\n';
      for (const p of ep.params) {
        md += '| ' + p.name + ' | ' + p.in + ' | ' + (p.req ? 'Yes' : 'No') + ' |\\n';
      }
      md += '\\n';
    }
    
    if (ep.responses.length > 0) {
      md += '| Status | Description |\\n';
      md += '|---|---|\\n';
      for (const r of ep.responses) {
        md += '| ' + r.status + ' | ' + r.desc + ' |\\n';
      }
      md += '\\n';
    }
  }
}

const docsDir = path.join(__dirname, 'docs', 'api');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

fs.writeFileSync(path.join(docsDir, 'api-documentation.md'), md);
console.log('Successfully generated docs/api/api-documentation.md');
