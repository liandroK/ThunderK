const cds = require('@sap/cds');

module.exports = async (srv) => {
    const db = await cds.connect.to('db');
    const { Approvers, Sales, SalesItems, Materials } = db.entities;

    srv.on('create_salesorder', async (req) => {
        const { email_vendor, email_comprador, items } = req.data.sales;

        // Obter o aprovador
        const approver = await SELECT.from(Approvers).where({ vendor: email_vendor });

        if (!approver || approver.length === 0) {
            return `Aprovador com email ${email_vendor} não encontrado.`;
        }

        let newSale = {};
        let valor_total = 0;
        let itemCounter = 0;
        let valor_iva_total = 0;

        if (items && items.length > 0) {
            for (const item of items) {
                const material = await SELECT.one.from(Materials).where({ name: item.material });
                if (!material) {
                    return (`Material ${item.material} não encontrado`);
                }
                // Verifica se a quantidade pedida é maior que a quantidade disponível em stock
                if (item.qtd > material.stock) {
                    return (`Quantidade pedida (${item.qtd}) ultrapasa o stock disponível (${material.stock}) para o material `);
                }


                const item_total = material.price * item.qtd;
                const item_iva = item_total * 0.23;
                valor_total += item_total + item_iva;
                valor_iva_total += item_iva;

                const maxSalesID = await SELECT.one('MAX(salesID) as maxID').from(Sales);
                const newSalesID = parseInt(maxSalesID.maxID || 0) + 1;
                newSale = {
                    salesID: newSalesID,
                    comprador: email_comprador,
                    vendor: email_vendor,
                    valor_total: valor_total,
                    status: "Pendente",
                    valor_iva: valor_iva_total
                };



                const newSalesItem = {
                    salesID: newSale.salesID,
                    item: itemCounter++,
                    sale: newSale,
                    material_ID: material.ID,
                    description: material.description,
                    price_unit: material.price,
                    iva_unit: material.price * 0.23,
                    price_total: (material.price * item.qtd) * 1.23,
                    qtd: item.qtd,
                };

                //Atualiza o stock do material após a venda
                const novo_stock = material.stock - item.qtd;
                await UPDATE(Materials)
                    .set({ stock: novo_stock })
                    .where({ ID: material.ID });

                await INSERT(newSalesItem).into(SalesItems);

            }

        }

        const result = await INSERT(newSale).into(Sales);
        return `Sales order ${result.ID} created successfully!`;
    });

    srv.on('updateStatus', async req => {
        return await UPDATE(Sales)
            .set({ status: req.data.status })
            .where({ ID: req.data.id });
    })
    srv.on('READ', 'aprovadores', async (req, next) => {
        try {
            const result = await next(); 
            if (!result || result.length === 0) {
                req.reject(400, 'Aprovador não encontrado.');
            } else {
                return result; 
            }
        } catch (error) {
            
            req.reject(500, 'Internal server error.');
        }
    });
    
};




