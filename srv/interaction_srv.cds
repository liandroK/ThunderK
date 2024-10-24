using app.salesK from '../db/interactions';
using V_GETSALESAPPROVER from '../db/interactions';

service Sales.service {
    
    type Email: String(320);
  
    type Sales {
        email_comprador   : Email;
        email_vendor      : Email;
        items       : many SalesItems;  
    };

    type SalesItems {
        material    : UUID;
        qtd         : Integer;
    };

    @odata.draft.bypass: true
    entity aprovadores as projection on salesK.Approvers;
    
    @odata.draft.bypass: true
    entity artigos as select from salesK.Materials;

    @readonly: true
    entity sales as projection on salesK.Sales;
    
    @readonly: true
    entity salesItems as projection on salesK.SalesItems;

    @readonly: true
    entity getSaleApprover as projection on V_GETSALESAPPROVER;

    function getSalesForPerson(email: Email) returns array of Sales;
  
    function create_salesorder(sales: Sales) returns String;

    action updateStatus(id: UUID, status: String) returns Boolean;

    action validateApprovers(vendor: Email, approver: Email) returns Boolean;
}
   