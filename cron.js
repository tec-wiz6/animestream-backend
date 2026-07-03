const { scrapeFullDetails } = require('./api/index');

async function run() {
    console.log('⏰ Cron job started:', new Date().toISOString());
    try {
        await scrapeFullDetails();
        console.log('✅ Cron job completed successfully');
    } catch (error) {
        console.error('❌ Cron job failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    run().then(() => process.exit(0));
}