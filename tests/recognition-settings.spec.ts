import {test,expect} from '@playwright/test';
test('product settings expose no recognition evaluation or synthetic model controls',async({page})=>{
 await page.goto('/');await page.locator('.globalSettings').click();
 await expect(page.getByRole('heading',{name:'등록 목록 비우기',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/인식 검증|합성 모델|모델 실행/})).toHaveCount(0);
});
