import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const TaxComparisonTool = () => {
  // URL parameter handling
  const getInitialParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      customSalary: parseFloat(params.get('customSalary')) || 12570,
      customExpenses: parseFloat(params.get('customExpenses')) || 0,
      customInsurance: parseFloat(params.get('customInsurance')) || 0,
      customInsideIR35: params.get('customInsideIR35') === 'true',
      minIncome: parseFloat(params.get('minIncome')) || 0,
      maxIncome: parseFloat(params.get('maxIncome')) || 200000,
      enabledLines: params.get('enabled')?.split(',') || ['paye', 'sole-trader', 'ltd-outside', 'ltd-inside']
    };
  };

  const initial = getInitialParams();
  const [enabledLines, setEnabledLines] = useState(initial.enabledLines);
  const [customSalary, setCustomSalary] = useState(initial.customSalary);
  const [customExpenses, setCustomExpenses] = useState(initial.customExpenses);
  const [customInsurance, setCustomInsurance] = useState(initial.customInsurance);
  const [customInsideIR35, setCustomInsideIR35] = useState(initial.customInsideIR35);
  const [minIncome, setMinIncome] = useState(initial.minIncome);
  const [maxIncome, setMaxIncome] = useState(initial.maxIncome);

  // Update URL when parameters change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const params = new URLSearchParams();
      params.set('customSalary', customSalary.toString());
      params.set('customExpenses', customExpenses.toString());
      params.set('customInsurance', customInsurance.toString());
      params.set('customInsideIR35', customInsideIR35.toString());
      params.set('minIncome', minIncome.toString());
      params.set('maxIncome', maxIncome.toString());
      params.set('enabled', enabledLines.join(','));
      window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [customSalary, customExpenses, customInsurance, customInsideIR35, minIncome, maxIncome, enabledLines]);

  // UK Tax Calculations (2024/25 tax year estimates)
  const calcIncomeTax = (income) => {
    const personalAllowance = Math.max(0, 12570 - Math.max(0, income - 100000) * 0.5);
    let taxableIncome = Math.max(0, income - personalAllowance);
    
    let tax = 0;
    if (taxableIncome > 125140) {
      tax += (taxableIncome - 125140) * 0.45;
      taxableIncome = 125140;
    }
    if (taxableIncome > 50270) {
      tax += (taxableIncome - 50270) * 0.40;
      taxableIncome = 50270;
    }
    if (taxableIncome > 0) {
      tax += taxableIncome * 0.20;
    }
    return tax;
  };

  const calcEmployeeNI = (income) => {
    let remaining = income;
    let ni = 0;
    if (remaining > 50270) {
      ni += (remaining - 50270) * 0.02;
      remaining = 50270;
    }
    if (remaining > 12570) {
      ni += (remaining - 12570) * 0.12;
    }
    return ni;
  };

  const calcClass4NI = (profit) => {
    let remaining = profit;
    let ni = 0;
    if (remaining > 50270) {
      ni += (remaining - 50270) * 0.02;
      remaining = 50270;
    }
    if (remaining > 12570) {
      ni += (remaining - 12570) * 0.09;
    }
    return ni;
  };

  const calcClass2NI = (profit) => {
    return profit > 6725 ? 179.40 : 0; // £3.45/week
  };

  const calcCorporationTax = (profit) => {
    if (profit <= 50000) return profit * 0.19;
    if (profit >= 250000) return profit * 0.25;
    // Marginal relief between 50k and 250k
    const marginalRate = 0.25 - (250000 - profit) * 0.015 / 200000;
    return profit * marginalRate;
  };

  const calcDividendTax = (dividends, otherIncome) => {
    const dividendAllowance = 500;
    const taxableDividends = Math.max(0, dividends - dividendAllowance);
    
    let tax = 0;
    let remaining = taxableDividends;
    
    // Determine which tax band the dividends fall into
    const basicRateLimit = 50270;
    const higherRateLimit = 125140;
    
    const basicRateRemaining = Math.max(0, basicRateLimit - otherIncome);
    const higherRateRemaining = Math.max(0, higherRateLimit - otherIncome - basicRateRemaining);
    
    // Basic rate dividends (8.75%)
    if (remaining > 0 && basicRateRemaining > 0) {
      const atBasicRate = Math.min(remaining, basicRateRemaining);
      tax += atBasicRate * 0.0875;
      remaining -= atBasicRate;
    }
    
    // Higher rate dividends (33.75%)
    if (remaining > 0 && higherRateRemaining > 0) {
      const atHigherRate = Math.min(remaining, higherRateRemaining);
      tax += atHigherRate * 0.3375;
      remaining -= atHigherRate;
    }
    
    // Additional rate dividends (39.35%)
    if (remaining > 0) {
      tax += remaining * 0.3935;
    }
    
    return tax;
  };

  // Calculate net income for each scenario
  const calculatePAYE = (gross) => {
    const incomeTax = calcIncomeTax(gross);
    const ni = calcEmployeeNI(gross);
    return gross - incomeTax - ni;
  };

  const calculateSoleTrader = (gross) => {
    const incomeTax = calcIncomeTax(gross);
    const class4NI = calcClass4NI(gross);
    const class2NI = calcClass2NI(gross);
    return gross - incomeTax - class4NI - class2NI;
  };

  const calculateLtdOutsideIR35 = (gross, salary = 12570) => {
    // Director takes salary, rest as dividends after corporation tax
    const actualSalary = Math.min(salary, gross);
    const remainingProfit = gross - actualSalary;
    
    const salaryIncomeTax = calcIncomeTax(actualSalary);
    const salaryNI = calcEmployeeNI(actualSalary);
    
    const corpTax = calcCorporationTax(remainingProfit);
    const dividendsAvailable = remainingProfit - corpTax;
    const dividendTax = calcDividendTax(dividendsAvailable, actualSalary);
    
    return actualSalary - salaryIncomeTax - salaryNI + dividendsAvailable - dividendTax;
  };

  const calculateLtdInsideIR35 = (gross) => {
    // Treat as employment but with 5% expenses allowance
    const effectiveIncome = gross * 0.95;
    const incomeTax = calcIncomeTax(effectiveIncome);
    const ni = calcEmployeeNI(effectiveIncome);
    return effectiveIncome - incomeTax - ni;
  };

  const calculateCustom = (gross) => {
    if (customInsideIR35) {
      // Inside IR35: treat as employment income after expenses
      const effectiveIncome = Math.max(0, gross - customExpenses - customInsurance);
      const incomeTax = calcIncomeTax(effectiveIncome);
      const ni = calcEmployeeNI(effectiveIncome);
      return effectiveIncome - incomeTax - ni;
    } else {
      // Outside IR35: salary + dividends
      const actualSalary = Math.min(customSalary, gross);
      const remainingProfit = Math.max(0, gross - actualSalary - customExpenses - customInsurance);
      
      const salaryIncomeTax = calcIncomeTax(actualSalary);
      const salaryNI = calcEmployeeNI(actualSalary);
      
      const corpTax = calcCorporationTax(remainingProfit);
      const dividendsAvailable = remainingProfit - corpTax;
      const dividendTax = calcDividendTax(dividendsAvailable, actualSalary);
      
      return actualSalary - salaryIncomeTax - salaryNI + dividendsAvailable - dividendTax;
    }
  };

  // Generate data points
  const data = useMemo(() => {
    const points = [];
    const range = maxIncome - minIncome;
    const step = Math.max(1000, Math.round(range / 100));
    
    for (let gross = minIncome; gross <= maxIncome; gross += step) {
      const point = { gross };
      if (enabledLines.includes('paye')) point.paye = calculatePAYE(gross);
      if (enabledLines.includes('sole-trader')) point.soleTrader = calculateSoleTrader(gross);
      if (enabledLines.includes('ltd-outside')) point.ltdOutside = calculateLtdOutsideIR35(gross);
      if (enabledLines.includes('ltd-inside')) point.ltdInside = calculateLtdInsideIR35(gross);
      if (enabledLines.includes('custom')) point.custom = calculateCustom(gross);
      points.push(point);
    }
    return points;
  }, [enabledLines, customSalary, customExpenses, customInsurance, customInsideIR35, minIncome, maxIncome]);

  const toggleLine = (line) => {
    setEnabledLines(prev => 
      prev.includes(line) ? prev.filter(l => l !== line) : [...prev, line]
    );
  };

  const formatCurrency = (value) => `£${(value / 1000).toFixed(0)}k`;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">UK Tax Comparison Tool</h1>
      <p className="text-gray-600 mb-6">Compare net income across different working arrangements</p>
      
      <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
        <h2 className="text-lg font-semibold mb-3">Income Range</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Minimum Gross Income (£)
            </label>
            <input
              type="number"
              value={minIncome}
              onChange={(e) => setMinIncome(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border rounded-lg"
              min="0"
              step="1000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Maximum Gross Income (£)
            </label>
            <input
              type="number"
              value={maxIncome}
              onChange={(e) => setMaxIncome(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border rounded-lg"
              min="0"
              step="1000"
            />
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <ResponsiveContainer width="100%" height={500}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="gross" 
              tickFormatter={formatCurrency}
              label={{ value: 'Gross Income', position: 'insideBottom', offset: -5 }}
            />
            <YAxis 
              tickFormatter={formatCurrency}
              label={{ value: 'Net Income', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              formatter={(value) => `£${value.toFixed(0)}`}
              labelFormatter={(label) => `Gross: £${label.toFixed(0)}`}
            />
            <Legend />
            {enabledLines.includes('paye') && (
              <Line type="monotone" dataKey="paye" stroke="#3b82f6" name="PAYE" strokeWidth={2} dot={false} />
            )}
            {enabledLines.includes('sole-trader') && (
              <Line type="monotone" dataKey="soleTrader" stroke="#10b981" name="Sole Trader" strokeWidth={2} dot={false} />
            )}
            {enabledLines.includes('ltd-outside') && (
              <Line type="monotone" dataKey="ltdOutside" stroke="#8b5cf6" name="Ltd (Outside IR35)" strokeWidth={2} dot={false} />
            )}
            {enabledLines.includes('ltd-inside') && (
              <Line type="monotone" dataKey="ltdInside" stroke="#f59e0b" name="Ltd (Inside IR35)" strokeWidth={2} dot={false} />
            )}
            {enabledLines.includes('custom') && (
              <Line type="monotone" dataKey="custom" stroke="#ef4444" name="Custom" strokeWidth={2} dot={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Enable/Disable Scenarios</h2>
          <div className="space-y-3">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={enabledLines.includes('paye')}
                onChange={() => toggleLine('paye')}
                className="w-5 h-5 text-blue-500"
              />
              <span className="text-lg">PAYE (Employee)</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={enabledLines.includes('sole-trader')}
                onChange={() => toggleLine('sole-trader')}
                className="w-5 h-5 text-green-500"
              />
              <span className="text-lg">Sole Trader</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={enabledLines.includes('ltd-outside')}
                onChange={() => toggleLine('ltd-outside')}
                className="w-5 h-5 text-purple-500"
              />
              <span className="text-lg">Limited Company (Outside IR35)</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={enabledLines.includes('ltd-inside')}
                onChange={() => toggleLine('ltd-inside')}
                className="w-5 h-5 text-amber-500"
              />
              <span className="text-lg">Limited Company (Inside IR35)</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={enabledLines.includes('custom')}
                onChange={() => toggleLine('custom')}
                className="w-5 h-5 text-red-500"
              />
              <span className="text-lg">Custom Configuration</span>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Custom Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="flex items-center space-x-3 mb-3">
                <input
                  type="checkbox"
                  checked={customInsideIR35}
                  onChange={(e) => setCustomInsideIR35(e.target.checked)}
                  className="w-5 h-5"
                />
                <span className="text-lg font-medium">Inside IR35</span>
              </label>
              <p className="text-xs text-gray-500 ml-8">
                If checked, treated as employment income. If unchecked, uses salary/dividend split.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Director's Salary (£)
              </label>
              <input
                type="number"
                value={customSalary}
                onChange={(e) => setCustomSalary(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-lg"
                min="0"
                step="100"
                disabled={customInsideIR35}
              />
              <p className="text-xs text-gray-500 mt-1">
                Typical: £12,570 (personal allowance) or £9,100 (NI threshold)
                {customInsideIR35 && ' (disabled for Inside IR35)'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Annual Business Expenses (£)
              </label>
              <input
                type="number"
                value={customExpenses}
                onChange={(e) => setCustomExpenses(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-lg"
                min="0"
                step="100"
              />
              <p className="text-xs text-gray-500 mt-1">
                e.g., accountancy fees, software subscriptions
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Professional Insurance (£)
              </label>
              <input
                type="number"
                value={customInsurance}
                onChange={(e) => setCustomInsurance(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-lg"
                min="0"
                step="100"
              />
              <p className="text-xs text-gray-500 mt-1">
                Professional indemnity, public liability, etc.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Key Assumptions:</h3>
        <ul className="text-sm space-y-1 text-gray-700">
          <li>• Tax year 2024/25 rates (estimates)</li>
          <li>• Ltd (Outside IR35): £12,570 salary, remainder as dividends</li>
          <li>• Ltd (Inside IR35): 5% expenses allowance, rest as employment income</li>
          <li>• Sole Trader: Includes Class 2 and Class 4 NI contributions</li>
          <li>• Corporation tax: 19% up to £50k, 25% above £250k (with marginal relief)</li>
          <li>• This is for illustration only - consult a tax professional for advice</li>
        </ul>
      </div>
    </div>
  );
};

export default TaxComparisonTool;