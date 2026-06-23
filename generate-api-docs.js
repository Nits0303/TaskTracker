const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'apps', 'api', 'src');

function getAllFiles(dir, ext, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, ext, fileList);
    } else if (file.endsWith(ext)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const controllers = getAllFiles(apiDir, '.controller.ts');
const dtoFiles = getAllFiles(apiDir, '.dto.ts');

const dtos = {};

// Parse all DTOs
for (const file of dtoFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const classMatches = [...content.matchAll(/class\s+([A-Za-z0-9_]+)\s*(?:implements|extends)?[^{]*{([\s\S]*?)^}/gm)];
  for (const match of classMatches) {
    const className = match[1];
    const classBody = match[2];
    
    const fields = [];
    const fieldMatches = [...classBody.matchAll(/@ApiProperty(?:Optional)?\(\{([^}]*)\}\)\s*(?:[^@]*?)\s+([A-Za-z0-9_]+)[!?:;]*\s*([^;]*)/g)];
    
    for (const fMatch of fieldMatches) {
      const propsStr = fMatch[1];
      const fieldName = fMatch[2];
      
      let description = '';
      const descMatch = propsStr.match(/description:\s*['"]([^'"]+)['"]/);
      if (descMatch) description = descMatch[1];
      
      const isRequired = !fMatch[0].includes('@ApiPropertyOptional') && !fieldName.includes('?');
      let type = 'string';
      if (fMatch[3].includes('number')) type = 'number';
      if (fMatch[3].includes('boolean')) type = 'boolean';
      if (fMatch[3].includes('Date')) type = 'string (date)';
      if (fMatch[3].includes('[]')) type += '[]';
      
      fields.push({ name: fieldName, type, required: isRequired, description });
    }
    dtos[className] = fields;
  }
}

// Map tags to endpoints
const endpointsByTag = {};

const methods = ['Get', 'Post', 'Patch', 'Delete', 'Put'];

for (const file of controllers) {
  const content = fs.readFileSync(file, 'utf8');
  
  let basePath = '';
  const controllerMatch = content.match(/@Controller\(['"]([^'"]+)['"]/);
  if (controllerMatch) basePath = controllerMatch[1];

  let tag = path.basename(file, '.controller.ts');
  const tagMatch = content.match(/@ApiTags\(['"]([^'"]+)['"]/);
  if (tagMatch) tag = tagMatch[1];

  if (!endpointsByTag[tag]) endpointsByTag[tag] = [];

  const lines = content.split('\n');
  
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
      const queryParams = [];
      const pathParams = [];
      const responses = [];
      let isAuthRequired = content.includes('@ApiBearerAuth') || content.includes('JwtAuthGuard');
      let rateLimit = 'Standard limits apply';
      let requestBodyDto = null;
      
      for (let j = i - 1; j >= 0 && lines[j].trim().startsWith('@'); j--) {
        const decLine = lines[j].trim();
        
        const summaryMatch = decLine.match(/@ApiOperation\(\{.*summary:\s*['"]([^'"]+)['"]/);
        if (summaryMatch) summary = summaryMatch[1];
        
        const paramMatch = decLine.match(/@ApiParam\(\{.*name:\s*['"]([^'"]+)['"]/);
        if (paramMatch) pathParams.push({ name: paramMatch[1], description: paramMatch[0].match(/description:\s*['"]([^'"]+)['"]/) ? paramMatch[0].match(/description:\s*['"]([^'"]+)['"]/)[1] : '' });
        
        const queryMatch = decLine.match(/@ApiQuery\(\{.*name:\s*['"]([^'"]+)['"]/);
        if (queryMatch) queryParams.push({ name: queryMatch[1], req: !decLine.includes('required: false') });
        
        const resMatch = decLine.match(/@ApiResponse\(\{.*status:\s*(\d+).*description:\s*['"]([^'"]+)['"]/);
        if (resMatch) responses.push({ status: resMatch[1], desc: resMatch[2] });

        if (decLine.includes('@ApiBearerAuth')) isAuthRequired = true;
        if (decLine.includes('@Throttle')) rateLimit = 'Custom rate limit';
      }

      // Look forward to find @Body() dto type
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (lines[j].includes('{')) {
           const bodyMatch = lines[j].match(/@Body\(\)\s*[A-Za-z0-9_]+\s*:\s*([A-Za-z0-9_]+)/);
           if (bodyMatch) requestBodyDto = bodyMatch[1];
           break;
        }
      }

      endpointsByTag[tag].push({
        httpMethod,
        routePath: fullPath,
        summary,
        pathParams: pathParams.reverse(),
        queryParams: queryParams.reverse(),
        responses: responses.reverse(),
        isAuthRequired,
        rateLimit,
        requestBodyDto
      });
    }
  }
}

let md = '# Task Tracker — API Documentation\n\n';
md += '> Generated from OpenAPI spec. Interactive version available at `http://localhost:3000/api/docs`.\n\n';
md += '## Table of Contents\n';

const sortedTags = Object.keys(endpointsByTag).sort();
for (const tag of sortedTags) {
  const anchor = tag.toLowerCase().replace(/\s+/g, '-');
  md += `- [${tag}](#${anchor})\n`;
}
md += '\n---\n\n';

for (const tag of sortedTags) {
  md += `## ${tag}\n\n`;
  
  for (const ep of endpointsByTag[tag]) {
    md += `### ${ep.httpMethod} ${ep.routePath}\n`;
    md += `**Description:** ${ep.summary}\n`;
    md += `**Auth required:** ${ep.isAuthRequired ? 'Yes' : 'No'}\n`;
    md += `**Rate limit:** ${ep.rateLimit}\n\n`;
    
    if (ep.queryParams.length > 0) {
      md += '**Query Parameters:**\n';
      md += '| Parameter | Type | Required | Description |\n';
      md += '|---|---|---|---|\n';
      for (const q of ep.queryParams) {
        md += `| ${q.name} | string | ${q.req ? 'Yes' : 'No'} | - |\n`;
      }
      md += '\n';
    }

    if (ep.requestBodyDto && dtos[ep.requestBodyDto]) {
      md += '**Request Body:**\n';
      md += '| Field | Type | Required | Description |\n';
      md += '|---|---|---|---|\n';
      for (const field of dtos[ep.requestBodyDto]) {
        md += `| ${field.name} | ${field.type} | ${field.required ? 'Yes' : 'No'} | ${field.description} |\n`;
      }
      md += '\n';
    }

    if (ep.responses.length > 0) {
      const successRes = ep.responses.find(r => r.status.startsWith('2'));
      if (successRes) {
        md += `**Success Response (${successRes.status}):**\n`;
        md += '```json\n{\n  "message": "Success"\n}\n```\n\n';
      }

      const errorResponses = ep.responses.filter(r => !r.status.startsWith('2'));
      if (errorResponses.length > 0) {
        md += '**Error Responses:**\n';
        md += '| Code | Description |\n';
        md += '|---|---|\n';
        for (const r of errorResponses) {
          md += `| ${r.status} | ${r.desc} |\n`;
        }
        md += '\n';
      }
    }
    md += '---\n\n';
  }
}

const docsDir = path.join(__dirname, 'docs', 'api');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

fs.writeFileSync(path.join(docsDir, 'api-documentation.md'), md);
console.log('Successfully generated complete docs/api/api-documentation.md');
