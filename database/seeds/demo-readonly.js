/** Deterministic, isolated PKR data for the server-enforced read-only demo. */
require('../../scripts/require-test-database');
require('dotenv').config();
const crypto = require('crypto');
const connectDB = require('../../apps/api/src/infrastructure/database/connect');
const { query, queryOne, transaction, closePool } = require('../../apps/api/src/infrastructure/database/pool');
const users = require('../../apps/api/src/modules/users/users.repository');
const expenses = require('../../apps/api/src/modules/expenses/expenses.repository');
const income = require('../../apps/api/src/modules/income/income.repository');
const budgets = require('../../apps/api/src/modules/budgets/budgets.repository');
const goals = require('../../apps/api/src/modules/goals/goals.repository');

const EMAIL = 'demo@hisabkikitab.app';
const ref = (offset) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
  return { y: d.getFullYear(), m: d.getMonth() + 1, offset };
};
const at = (r, day) => new Date(r.y, r.m - 1, r.offset ? day : Math.min(day, new Date().getDate()), 12);
const date = (r, day) => at(r, day).toISOString().slice(0, 10);

async function clearOld() {
  const old = await users.findByEmail(EMAIL);
  if (!old) return;
  if (old.isDemo) {
    throw new Error('Read-only demo already exists; refusing to modify its protected data');
  }
  const spaces = await query('SELECT id FROM sl_spaces WHERE owner_id=$1', [old._id]);
  for (const { id } of spaces) {
    await transaction(async (tx) => {
      for (const table of ['sl_receipts','sl_shares','sl_payments','sl_bills','sl_expenses','sl_activity','sl_invites','sl_categories','sl_members','sl_periods','sl_memberships']) {
        await tx.query(`DELETE FROM ${table} WHERE space_id=$1`, [id]);
      }
      await tx.query('DELETE FROM sl_spaces WHERE id=$1', [id]);
    });
  }
  await query('DELETE FROM users WHERE id=$1', [old._id]);
}

async function personal(userId, months) {
  const currentIncome = [['Salary',150000,'Monthly salary',1],['Freelancing',35000,'Design project',8],['Other income',10000,'Other income',14]];
  const currentExpenses = [
    ['Rent',45000,'Apartment rent',2],['Groceries',22000,'Monthly groceries',6],
    ['Utilities',15000,'Electricity, gas and water',9],['Transport',12000,'Fuel and transport',12],
    ['Internet',5000,'Home internet',13],['Shopping',9000,'Household shopping',17],
    ['Others',7000,'Miscellaneous expenses',20],
  ];
  for (const [i, r] of months.entries()) {
    const age = months.length - i - 1;
    const incomes = r.offset === 0 ? currentIncome : [
      ['Salary',150000-Math.min(age,5)*2000,'Monthly salary',1],
      ['Freelancing',26000+(age%4)*3000,'Freelance project',8],
      ['Other income',7000+(age%3)*1500,'Other income',14],
    ];
    for (const [source,amount,note,day] of incomes) await income.create(userId,{financeMode:'student',source,amount,note,date:at(r,day)});
    for (const [category,base,description,day] of currentExpenses) {
      const amount = r.offset === 0 ? base : Math.max(1000,base-age*500+(day%3)*250);
      await expenses.create(userId,{financeMode:'student',category,amount,description,paymentMethod:day%2?'Card':'Bank Transfer',date:at(r,day)});
    }
    await budgets.upsertMany(userId,'student',[
      ['Rent',45000],['Groceries',25000],['Utilities',17000],['Transport',15000],
      ['Internet',5000],['Shopping',12000],['Others',10000],
    ].map(([category,limit])=>({category,limit})),r.m,r.y);
  }
  for (const goal of [
    {title:'Emergency fund',targetAmount:500000,savedAmount:280000,deadline:at(ref(8),1),icon:'🛡️',note:'Six months of essential costs'},
    {title:'Family holiday',targetAmount:250000,savedAmount:95000,deadline:at(ref(5),15),icon:'✈️',note:'Northern areas trip'},
    {title:'New laptop',targetAmount:180000,savedAmount:180000,deadline:null,icon:'💻',note:'Completed demo goal'},
  ]) await goals.create(userId,goal);
}

async function household(userId, months) {
  const rows = [
    ['house_rent',45000,'Family home rent',2],['groceries',26000,'Rashan and fresh food',6],
    ['electricity_bill',12000,'Electricity bill',9],['gas_bill',3500,'Gas bill',10],
    ['water_bill',1500,'Water charges',11],['internet',5000,'Home internet',13],
    ['school_fees',18000,'School fees',15],['transport_fuel',13000,'Fuel and transport',18],
  ];
  for (const r of months) {
    await income.create(userId,{financeMode:'householder',source:'salary',amount:185000,note:'Household salary',date:at(r,1)});
    await income.create(userId,{financeMode:'householder',source:'rental_income',amount:25000,note:'Portion rent',date:at(r,5)});
    for (const [category,amount,description,day] of rows) await expenses.create(userId,{financeMode:'householder',category,amount,description,paymentMethod:'Bank Transfer',date:at(r,day)});
    await budgets.upsertMany(userId,'householder',rows.map(([category,amount])=>({category,limit:Math.ceil(amount*1.15)})),r.m,r.y);
  }
}

async function debts(userId) {
  for (const row of [
    ['LENT','Ali Raza',30000,10000,'Laptop repair help','Education',-4,2],
    ['BORROWED','Sara Ahmed',20000,5000,'Short-term family expense','Others',-3,1],
    ['LENT','Usman Khan',15000,15000,'Shared travel booking','Travel',-7,-1],
  ]) {
    const [kind,person,original,paid,purpose,category,start,due] = row;
    await query(`INSERT INTO debts (user_id,finance_mode,kind,person_name,original_amount,paid_amount,status,transaction_date,due_date,category,purpose,note,settled_at)
      VALUES ($1,'student',$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)`,[
      userId,kind,person,original,paid,paid===original?'SETTLED':'PARTIALLY_PAID',at(ref(start),12),at(ref(due),20),category,purpose,paid===original?at(ref(-1),20):null,
    ]);
  }
}

async function shared(userId) {
  const space = await transaction(async (tx) => {
    const created = await tx.queryOne(`INSERT INTO sl_spaces (owner_id,name,currency,residents,description,organization_type,organization_name)
      VALUES ($1,'Lahore Shared Apartment','PKR',3,'Fictional read-only shared household','other','') RETURNING id`,[userId]);
    await tx.query(`INSERT INTO sl_memberships (space_id,user_id,role) VALUES ($1,$2,'admin')`,[created.id,userId]);
    return created;
  });
  const members=[];
  for (const name of ['Ayesha Malik','Hamza Siddiqui','Mariam Shah']) members.push(await queryOne(`INSERT INTO sl_members (space_id,name,joined_on) VALUES ($1,$2,$3) RETURNING id`,[space.id,name,date(ref(-12),1)]));
  const food=await queryOne(`INSERT INTO sl_categories (space_id,kind,stable_key,name,position) VALUES ($1,'food','groceries','Groceries',1) RETURNING id`,[space.id]);
  const utility=await queryOne(`INSERT INTO sl_categories (space_id,kind,stable_key,name,position) VALUES ($1,'bill','utilities','Utilities',1) RETURNING id`,[space.id]);
  for (const r of Array.from({length:6},(_,i)=>ref(i-5))) await transaction(async(tx)=>{
    const period=await tx.queryOne(`INSERT INTO sl_periods (space_id,month,budget_minor,food_budget_minor) VALUES ($1,$2,9000000,4500000) RETURNING id`,[space.id,`${r.y}-${String(r.m).padStart(2,'0')}-01`]);
    const exp=await tx.queryOne(`INSERT INTO sl_expenses (space_id,period_id,category_id,date,amount_minor,note,method) VALUES ($1,$2,$3,$4,3600000,'Monthly groceries','equal') RETURNING id`,[space.id,period.id,food.id,date(r,5)]);
    const bill=await tx.queryOne(`INSERT INTO sl_bills (space_id,period_id,category_id,name,date,due_date,amount_minor,paid,paid_by,note,method) VALUES ($1,$2,$3,'Utilities',$4,$5,1800000,true,$6,'Electricity, gas and water','equal') RETURNING id`,[space.id,period.id,utility.id,date(r,9),date(r,15),members[0].id]);
    for(const member of members){
      await tx.query(`INSERT INTO sl_shares (space_id,expense_id,member_id,amount_minor) VALUES ($1,$2,$3,1200000)`,[space.id,exp.id,member.id]);
      await tx.query(`INSERT INTO sl_shares (space_id,bill_id,member_id,amount_minor) VALUES ($1,$2,$3,600000)`,[space.id,bill.id,member.id]);
      await tx.query(`INSERT INTO sl_payments (space_id,period_id,member_id,amount_minor,date,method,note) VALUES ($1,$2,$3,1800000,$4,'bank','Monthly contribution')`,[space.id,period.id,member.id,date(r,3)]);
    }
  });
}

async function run(){
  await connectDB();
  await clearOld();
  const user=await users.create({name:'Demo User',email:EMAIL,password:crypto.randomBytes(48).toString('base64url'),monthlyIncome:195000,currency:'PKR',university:'Fictional Demo Profile',hostelName:'Lahore'});
  await users.updateProfile(user._id,{onboardingCompleted:true,financeMode:'student'});
  const months=Array.from({length:12},(_,i)=>ref(i-11));
  await personal(user._id,months); await household(user._id,months); await debts(user._id); await shared(user._id);
  await query('UPDATE users SET is_demo=true WHERE id=$1',[user._id]);
  const total=await queryOne(`SELECT (SELECT sum(amount_minor)::text FROM income WHERE user_id=$1 AND finance_mode='student' AND date>=date_trunc('month',now())) AS income,(SELECT sum(amount_minor)::text FROM expenses WHERE user_id=$1 AND finance_mode='student' AND date>=date_trunc('month',now())) AS expenses`,[user._id]);
  if(total.income!=='19500000'||total.expenses!=='11500000') throw new Error('Demo totals do not match the documented PKR sample');
  console.log('[seed] read-only demo data ready (12 months, PKR)');
  await closePool();
}
run().catch(async(error)=>{console.error('[seed] failed:',error.message);await closePool().catch(()=>{});process.exitCode=1;});
