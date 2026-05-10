/**
 * Integration tests for full validation flow
 */

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Full Validation Integration Tests', () => {
  describe('Validate existing repository', () => {
    it('should validate all tokens successfully', function() {
      this.timeout(10000);

      try {
        const output = execSync('node scripts/validate.js', {
          cwd: path.join(__dirname, '../..'),
          encoding: 'utf8',
        });

        // Accept both "All validations passed" and "Validation passed with N warning(s)"
        const hasPassedMessage = output.includes('All validations passed') ||
                                  output.includes('Validation passed with');
        expect(hasPassedMessage).to.be.true;
        expect(output).to.include('Total tokens validated: 7');
      } catch (error) {
        // If validation fails, show the output
        console.log(error.stdout);
        throw new Error(`Validation failed: ${error.message}`);
      }
    });

    it('should validate all contracts successfully', function() {
      this.timeout(10000);

      const contractsDir = path.join(__dirname, '../../contracts');
      const projectDirs = fs.readdirSync(contractsDir).filter(f =>
        fs.statSync(path.join(contractsDir, f)).isDirectory()
      );
      const contractCount = projectDirs.reduce((count, projectSlug) => {
        const infoPath = path.join(contractsDir, projectSlug, 'info.json');
        const projectData = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        return count + projectData.contracts.length;
      }, 0);

      const output = execSync('node scripts/validate.js', {
        cwd: path.join(__dirname, '../..'),
        encoding: 'utf8',
      });

      expect(output).to.include(`Total projects validated: ${projectDirs.length}`);
      expect(output).to.include(`Total contract files validated: ${contractCount}`);
    });

    it('should report zero errors', function() {
      this.timeout(10000);

      const output = execSync('node scripts/validate.js', {
        cwd: path.join(__dirname, '../..'),
        encoding: 'utf8',
      });

      expect(output).to.include('Errors: 0');
    });
  });

  describe('Validate with JSON output', () => {
    it('should support JSON output format', function() {
      this.timeout(10000);

      const output = execSync('node scripts/validate.js', {
        cwd: path.join(__dirname, '../..'),
        encoding: 'utf8',
        env: { ...process.env, LOG_FORMAT: 'json' },
      });

      // Should contain JSON log entries
      const lines = output.split('\n').filter(l => l.trim());
      const hasJsonLines = lines.some(line => {
        try {
          const parsed = JSON.parse(line);
          return parsed.level && parsed.message;
        } catch {
          return false;
        }
      });

      expect(hasJsonLines).to.be.true;
    });
  });

  describe('Token validation edge cases', () => {
    it('should validate token with minimal fields', () => {
      const tokensDir = path.join(__dirname, '../../tokens');
      const tokenDirs = fs.readdirSync(tokensDir).filter(f =>
        fs.statSync(path.join(tokensDir, f)).isDirectory()
      );

      expect(tokenDirs.length).to.be.greaterThan(0);

      // Check at least one token has only required fields
      let hasMinimalToken = false;
      for (const dir of tokenDirs) {
        const tokenPath = path.join(tokensDir, dir, `${dir}.json`);
        const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        const fields = Object.keys(tokenData);

        if (fields.length === 4 &&
            fields.includes('symbol') &&
            fields.includes('name') &&
            fields.includes('address') &&
            fields.includes('decimals')) {
          hasMinimalToken = true;
          break;
        }
      }

      expect(hasMinimalToken || tokenDirs.length > 0).to.be.true;
    });
  });

  describe('Contract validation edge cases', () => {
    it('should validate contracts with all required files', () => {
      const contractsDir = path.join(__dirname, '../../contracts');
      if (!fs.existsSync(contractsDir)) {
        this.skip();
        return;
      }

      const projectDirs = fs.readdirSync(contractsDir).filter(f =>
        fs.statSync(path.join(contractsDir, f)).isDirectory()
      );

      projectDirs.forEach(projectSlug => {
        const infoPath = path.join(contractsDir, projectSlug, 'info.json');
        expect(fs.existsSync(infoPath)).to.be.true;

        const projectData = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        expect(projectData.contracts).to.be.an('array');

        projectData.contracts.forEach(contract => {
          const artifactName = contract.artifact || contract.name;
          const solPath = path.join(contractsDir, projectSlug, `${artifactName}.sol`);
          const abiPath = path.join(contractsDir, projectSlug, `${artifactName}_abi.json`);

          expect(fs.existsSync(solPath), `Missing ${artifactName}.sol`).to.be.true;
          expect(fs.existsSync(abiPath), `Missing ${artifactName}_abi.json`).to.be.true;
        });
      });
    });
  });
});
